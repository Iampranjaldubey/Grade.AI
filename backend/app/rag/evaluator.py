"""
AI-powered grading evaluator using Google Gemini (google-genai SDK).
Performs RAG-based evaluation with rubrics and course context.

The model is asked for *structured output*: the response is constrained to the
``GradingResponse`` Pydantic schema, so there is no free-text JSON to scrape.
The model only judges each criterion; totals and percentages are computed here
from the rubric, which is the source of truth for criterion names and maxima.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx
import structlog
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field, ValidationError

from app.core.config import Settings
from app.models.assignment import Assignment
from app.models.rubric import Rubric
from app.rag.retrieval import RetrievalResult

logger = structlog.get_logger(__name__)

# Attempts per model before moving on to the fallback model. Kept small: each
# attempt can take up to GEMINI_REQUEST_TIMEOUT_SECONDS, and the whole task is
# bounded by the Celery soft time limit.
ATTEMPTS_PER_MODEL = 2
RETRY_BACKOFF_SECONDS = 2.0

# HTTP status codes worth retrying: rate limiting and transient server faults
# (the API returns 503 "high demand" and 504 "deadline exceeded" under load).
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
# The key itself is bad - no other model or attempt will succeed.
AUTH_STATUS_CODES = {401, 403}

MAX_LISTED_ITEMS = 3  # strengths / weaknesses shown to students


class CriterionAssessment(BaseModel):
    """The model's judgement of a single rubric criterion."""

    criterion_name: str = Field(description="Exact criterion name, copied from the rubric")
    awarded: float = Field(description="Points awarded, from 0 to the criterion's max points")
    reasoning: str = Field(
        description="2-3 specific sentences explaining the score, referencing the submission"
    )


class GradingResponse(BaseModel):
    """Schema the model's output is constrained to."""

    criteria_scores: list[CriterionAssessment] = Field(
        description="Exactly one entry per rubric criterion, in rubric order"
    )
    strengths: list[str] = Field(description="Up to 3 specific strengths, with examples")
    weaknesses: list[str] = Field(description="Up to 3 specific weaknesses, with examples")
    missing_topics: list[str] = Field(
        description="Topics the rubric requires that the submission does not address"
    )
    overall_feedback: str = Field(description="3-4 sentences of constructive summary feedback")
    confidence_score: float = Field(
        description="Confidence in this evaluation, from 0.0 (guessing) to 1.0 (certain)"
    )


class InvalidModelOutputError(ValueError):
    """The model answered, but the answer cannot be turned into a grade."""


class FatalModelError(RuntimeError):
    """An error no retry or fallback model can fix (e.g. an invalid API key)."""


@dataclass
class EvaluationResult:
    """Result of AI evaluation."""

    total_score: float
    max_score: float
    percentage: float
    criteria_scores: list[dict[str, Any]]  # Each: criterion_name, awarded, max, reasoning
    strengths: list[str]  # Max 3
    weaknesses: list[str]  # Max 3
    missing_topics: list[str]
    overall_feedback: str
    confidence_score: float  # 0-1
    retrieved_sources: list[str]  # Source file names
    is_fallback: bool = (
        False  # True only for the placeholder produced when AI grading fails entirely
    )
    model_name: str | None = None  # Model that produced the grade (None for the placeholder)


class GradingEvaluator:
    """
    AI-powered grading evaluator using Google Gemini.
    Performs structured evaluation based on rubrics and retrieved context.
    """

    def __init__(
        self,
        settings: Settings,
        client: genai.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        """
        Args:
            settings: Application settings (Gemini key, models, timeout).
            client: Optional pre-built client; tests inject a fake here.
            sleep: Backoff function; tests inject a no-op.
        """
        self.settings = settings
        self._sleep = sleep
        self.models = list(
            dict.fromkeys(m for m in (settings.gemini_model, settings.gemini_fallback_model) if m)
        )

        if client is not None:
            self.client: genai.Client | None = client
        elif settings.gemini_api_key:
            self.client = genai.Client(
                api_key=settings.gemini_api_key,
                http_options=types.HttpOptions(
                    timeout=settings.gemini_request_timeout_seconds * 1000  # milliseconds
                ),
            )
        else:
            self.client = None

        logger.info("gemini_evaluator_initialized", models=self.models, enabled=bool(self.client))

    def evaluate(
        self,
        submission_text: str,
        rubrics: list[Rubric],
        retrieval_result: RetrievalResult,
        assignment: Assignment,
    ) -> EvaluationResult:
        """
        Evaluate a submission using AI with RAG context.

        Tries the primary model, then the fallback model, retrying transient
        failures. If every attempt fails, returns a flagged placeholder that is
        never auto-approved.
        """
        logger.info(
            "starting_evaluation",
            assignment_id=str(assignment.id),
            rubric_count=len(rubrics),
        )

        if self.client is None:
            logger.warning("gemini_api_key_missing")
            return self._create_fallback_evaluation(rubrics, assignment, retrieval_result)

        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(
            submission_text=submission_text,
            rubrics=rubrics,
            retrieval_result=retrieval_result,
            assignment=assignment,
        )
        sources = self._source_names(retrieval_result)

        try:
            for model in self.models:
                result = self._evaluate_with_model(
                    model, system_prompt, user_prompt, rubrics, assignment, sources
                )
                if result is not None:
                    return result
        except FatalModelError as exc:
            logger.error("gemini_fatal_error", error=str(exc))
        except Exception:
            # Preserve the contract that evaluate() never raises: an unexpected
            # SDK error must still produce the flagged placeholder for a human.
            logger.exception("gemini_unexpected_error")

        return self._create_fallback_evaluation(rubrics, assignment, retrieval_result)

    def _evaluate_with_model(
        self,
        model: str,
        system_prompt: str,
        user_prompt: str,
        rubrics: list[Rubric],
        assignment: Assignment,
        sources: list[str],
    ) -> EvaluationResult | None:
        """Run up to ATTEMPTS_PER_MODEL attempts on one model; None means give up on it."""
        for attempt in range(1, ATTEMPTS_PER_MODEL + 1):
            log = logger.bind(model=model, attempt=attempt)
            try:
                response = self._generate(model, system_prompt, user_prompt)
                result = self._build_result(response, rubrics, assignment, sources, model)
                log.info(
                    "gemini_evaluation_succeeded",
                    total_score=result.total_score,
                    confidence=result.confidence_score,
                )
                return result
            except errors.APIError as exc:
                if exc.code in AUTH_STATUS_CODES:
                    raise FatalModelError(f"Gemini rejected the API key ({exc.code})") from exc
                if exc.code not in RETRYABLE_STATUS_CODES:
                    # e.g. 404 model retired, 400 bad request: retrying won't help.
                    log.error("gemini_model_unusable", code=exc.code, error=str(exc)[:300])
                    return None
                log.warning("gemini_transient_error", code=exc.code, error=str(exc)[:300])
            except httpx.TransportError as exc:  # includes timeouts
                log.warning("gemini_network_error", error=str(exc)[:300])
            except InvalidModelOutputError as exc:
                log.warning("gemini_invalid_output", error=str(exc)[:300])

            if attempt < ATTEMPTS_PER_MODEL:
                self._sleep(RETRY_BACKOFF_SECONDS * attempt)

        return None

    def _generate(
        self, model: str, system_prompt: str, user_prompt: str
    ) -> types.GenerateContentResponse:
        assert self.client is not None
        return self.client.models.generate_content(
            model=model,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.1,  # Low temperature for consistent grading
                # Generous ceiling: on thinking models, reasoning tokens count
                # toward it, and a truncated response fails schema validation.
                max_output_tokens=8192,
                response_mime_type="application/json",
                response_schema=GradingResponse,
            ),
        )

    def _build_result(
        self,
        response: types.GenerateContentResponse,
        rubrics: list[Rubric],
        assignment: Assignment,
        sources: list[str],
        model: str,
    ) -> EvaluationResult:
        """Validate the structured response against the rubric and compute the grade."""
        parsed = self._parse_structured(response)

        by_name = {c.criterion_name.strip().casefold(): c for c in parsed.criteria_scores}
        missing = [
            r.criteria_name for r in rubrics if r.criteria_name.strip().casefold() not in by_name
        ]
        if missing:
            raise InvalidModelOutputError(f"Response omitted rubric criteria: {missing}")
        if len(by_name) != len(rubrics):
            logger.warning(
                "unexpected_criteria_ignored",
                expected=len(rubrics),
                received=len(parsed.criteria_scores),
            )

        criteria_scores: list[dict[str, Any]] = []
        for rubric in rubrics:
            assessment = by_name[rubric.criteria_name.strip().casefold()]
            max_points = float(rubric.max_points)
            awarded = min(max(assessment.awarded, 0.0), max_points)
            if awarded != assessment.awarded:
                logger.warning(
                    "criterion_score_clamped",
                    criterion=rubric.criteria_name,
                    returned=assessment.awarded,
                    max=max_points,
                )
            criteria_scores.append(
                {
                    # Use the rubric's exact name, not the model's echo of it.
                    "criterion_name": rubric.criteria_name,
                    "awarded": round(awarded, 2),
                    "max": max_points,
                    "reasoning": assessment.reasoning,
                }
            )

        # Rubric max_points are validated to sum to the assignment max_score, so
        # the total is derived rather than trusted from the model.
        max_score = float(assignment.max_score)
        total_score = round(sum(c["awarded"] for c in criteria_scores), 2)
        percentage = round(total_score / max_score * 100, 2) if max_score else 0.0

        return EvaluationResult(
            total_score=total_score,
            max_score=max_score,
            percentage=percentage,
            criteria_scores=criteria_scores,
            strengths=parsed.strengths[:MAX_LISTED_ITEMS],
            weaknesses=parsed.weaknesses[:MAX_LISTED_ITEMS],
            missing_topics=parsed.missing_topics,
            overall_feedback=parsed.overall_feedback,
            confidence_score=min(max(parsed.confidence_score, 0.0), 1.0),
            retrieved_sources=sources,
            model_name=model,
        )

    @staticmethod
    def _parse_structured(response: types.GenerateContentResponse) -> GradingResponse:
        """Return the schema-validated response, or raise InvalidModelOutputError."""
        if isinstance(response.parsed, GradingResponse):
            return response.parsed

        # The SDK leaves `parsed` empty when the JSON doesn't validate, most often
        # because the output was cut off. Validate the raw text ourselves to get a
        # precise error, and report why generation stopped.
        finish_reason = None
        if response.candidates:
            finish_reason = response.candidates[0].finish_reason
        try:
            return GradingResponse.model_validate_json(response.text or "")
        except ValidationError as exc:
            raise InvalidModelOutputError(
                f"Response did not match schema (finish_reason={finish_reason}): "
                f"{exc.error_count()} error(s)"
            ) from exc

    @staticmethod
    def _source_names(retrieval_result: RetrievalResult) -> list[str]:
        return sorted(
            {
                chunk.source_name
                for chunks in (
                    retrieval_result.rubric_chunks,
                    retrieval_result.notes_chunks,
                    retrieval_result.sample_chunks,
                )
                for chunk in chunks
            }
        )

    def _build_system_prompt(self) -> str:
        """Build system prompt for the evaluator."""
        return """You are an expert academic evaluator. Your task is to grade student submissions based ONLY on the provided rubric criteria and course materials.

Guidelines:
- Be fair, specific, and constructive in your feedback
- Award points based on demonstrated understanding and quality of work
- Reference specific parts of the student's submission in your reasoning
- Never hallucinate facts not present in the provided context
- Use the course materials and sample solutions as reference standards
- Be consistent and objective in applying rubric criteria
- Provide actionable feedback that helps students improve"""

    def _build_user_prompt(
        self,
        submission_text: str,
        rubrics: list[Rubric],
        retrieval_result: RetrievalResult,
        assignment: Assignment,
    ) -> str:
        """Build user prompt with all context."""

        # Assignment info
        prompt = f"""=== ASSIGNMENT ===
Title: {assignment.title}
Description: {assignment.description or "No description provided"}
Max Score: {assignment.max_score}
Grading Mode: {assignment.grading_mode.value}

"""

        # Rubric criteria
        prompt += "=== GRADING RUBRIC ===\n"
        for rubric in rubrics:
            prompt += f"""
Criterion: {rubric.criteria_name} (Weight: {rubric.weight}%, Max Points: {rubric.max_points})
Description: {rubric.description or "No description"}
Evaluation Hints: {rubric.evaluation_hints or "No specific hints"}
---
"""

        # Course notes context
        if retrieval_result.notes_chunks:
            prompt += "\n=== RELEVANT COURSE MATERIAL ===\n"
            for chunk in retrieval_result.notes_chunks:
                prompt += f"""
Source: {chunk.source_name}
{chunk.chunk_text}
---
"""

        # Sample solution context
        if retrieval_result.sample_chunks:
            prompt += "\n=== SAMPLE SOLUTION EXCERPTS ===\n"
            for chunk in retrieval_result.sample_chunks:
                prompt += f"{chunk.chunk_text}\n---\n"

        # Student submission
        prompt += f"""
=== STUDENT SUBMISSION ===
<student_answer>
{submission_text}
</student_answer>

=== EVALUATION INSTRUCTIONS ===
Evaluate the student answer criterion by criterion based on the rubric above.

For each criterion:
1. Award points from 0 to the criterion's Max Points
2. Provide specific reasoning that references the student's actual text
3. Compare against the rubric description and evaluation hints

Return exactly one criteria_scores entry per rubric criterion, using the exact criterion name from the rubric.
"""

        return prompt

    def _create_fallback_evaluation(
        self,
        rubrics: list[Rubric],
        assignment: Assignment,
        retrieval_result: RetrievalResult,
    ) -> EvaluationResult:
        """Create a fallback evaluation when AI fails."""

        logger.warning("creating_fallback_evaluation")

        # Award 50% of points as placeholder
        criteria_scores = []
        for rubric in rubrics:
            # Convert Decimal to float to avoid type errors
            max_points_float = float(rubric.max_points)
            awarded_points = max_points_float * 0.5

            criteria_scores.append(
                {
                    "criterion_name": rubric.criteria_name,
                    "awarded": awarded_points,
                    "max": max_points_float,
                    "reasoning": "Automatic evaluation failed. Manual grading required.",
                }
            )

        # Convert assignment max_score to float
        max_score_float = float(assignment.max_score)
        total_score = max_score_float * 0.5

        return EvaluationResult(
            total_score=total_score,
            max_score=max_score_float,
            percentage=50.0,
            criteria_scores=criteria_scores,
            strengths=["Submission received"],
            weaknesses=["Automatic evaluation failed"],
            missing_topics=[],
            overall_feedback="Automatic evaluation encountered an error. This submission requires manual grading by the professor.",
            confidence_score=0.0,
            retrieved_sources=self._source_names(retrieval_result),
            is_fallback=True,
        )
