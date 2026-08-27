"""
Tests for app.rag.evaluator.GradingEvaluator: prompt building, response
parsing, fallback evaluation, and the evaluate()/retry control flow.

The Gemini SDK itself (genai.configure / GenerativeModel) is monkeypatched so
these tests exercise our parsing and control-flow logic without any network
call, matching the pattern used by test_fallback_grading.py.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from app.core.config import Settings
from app.core.enums import GradingMode
from app.rag.evaluator import EvaluationResult, GradingEvaluator
from app.rag.retrieval import RetrievalResult, RetrievedChunk


@dataclass
class FakeAssignment:
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    title: str = "Essay Assignment"
    description: str | None = "Write an essay"
    due_date: datetime = field(default_factory=lambda: datetime.now(UTC) + timedelta(days=1))
    max_score: Decimal = Decimal("100")
    grading_mode: GradingMode = GradingMode.AUTO


@dataclass
class FakeRubric:
    criteria_name: str = "Content"
    description: str | None = "Quality of content"
    max_points: Decimal = Decimal("100")
    weight: Decimal = Decimal("100")
    evaluation_hints: str | None = None


@pytest.fixture(autouse=True)
def patch_genai(monkeypatch):
    """Prevent real Gemini SDK calls; GradingEvaluator.__init__ configures it."""
    monkeypatch.setattr("app.rag.evaluator.genai.configure", MagicMock())
    monkeypatch.setattr(
        "app.rag.evaluator.genai.GenerativeModel", MagicMock(return_value=MagicMock())
    )


@pytest.fixture
def evaluator() -> GradingEvaluator:
    settings = Settings(GEMINI_API_KEY="test-key", GEMINI_MODEL="gemini-2.0-flash")
    return GradingEvaluator(settings)


@pytest.fixture
def empty_retrieval() -> RetrievalResult:
    return RetrievalResult(
        rubric_chunks=[], notes_chunks=[], sample_chunks=[], total_token_estimate=0
    )


VALID_RESPONSE_JSON = """{
  "total_score": 85,
  "max_score": 100,
  "percentage": 85.0,
  "criteria_scores": [
    {"criterion_name": "Content", "awarded": 85, "max": 100, "reasoning": "Solid work."}
  ],
  "strengths": ["Clear thesis", "Good examples", "Strong conclusion", "Extra one"],
  "weaknesses": ["Minor grammar issues", "Could cite more sources", "Extra weakness"],
  "overall_feedback": "Well done overall.",
  "confidence_score": 0.9
}"""


class TestParseResponse:
    def test_parses_valid_json(self, evaluator: GradingEvaluator) -> None:
        result = evaluator._parse_response(VALID_RESPONSE_JSON, max_score=100.0)
        assert result["total_score"] == 85
        assert result["overall_feedback"] == "Well done overall."
        assert result["missing_topics"] == []  # defaulted
        assert result["confidence_score"] == 0.9

    def test_strips_markdown_code_fences(self, evaluator: GradingEvaluator) -> None:
        wrapped = f"```json\n{VALID_RESPONSE_JSON}\n```"
        result = evaluator._parse_response(wrapped, max_score=100.0)
        assert result["total_score"] == 85

    def test_defaults_confidence_score_when_missing(self, evaluator: GradingEvaluator) -> None:
        text = VALID_RESPONSE_JSON.replace('"confidence_score": 0.9', '"confidence_score_x": 0.9')
        result = evaluator._parse_response(text, max_score=100.0)
        assert result["confidence_score"] == 0.7

    def test_clamps_total_score_exceeding_max(self, evaluator: GradingEvaluator) -> None:
        text = VALID_RESPONSE_JSON.replace('"total_score": 85', '"total_score": 150')
        result = evaluator._parse_response(text, max_score=100.0)
        assert result["total_score"] == 100.0
        assert result["percentage"] == 100.0

    def test_invalid_json_raises_value_error(self, evaluator: GradingEvaluator) -> None:
        with pytest.raises(ValueError, match="Failed to parse JSON response"):
            evaluator._parse_response("not json at all {{{", max_score=100.0)

    def test_missing_required_field_raises_value_error(self, evaluator: GradingEvaluator) -> None:
        text = '{"total_score": 1, "max_score": 100, "percentage": 1.0}'
        with pytest.raises(ValueError, match="Missing required field"):
            evaluator._parse_response(text, max_score=100.0)


class TestPromptBuilding:
    def test_system_prompt_mentions_key_guidance(self, evaluator: GradingEvaluator) -> None:
        prompt = evaluator._build_system_prompt()
        assert "expert academic evaluator" in prompt
        assert "rubric" in prompt.lower()

    def test_user_prompt_includes_assignment_and_rubric(
        self, evaluator: GradingEvaluator, empty_retrieval: RetrievalResult
    ) -> None:
        assignment = FakeAssignment()
        rubric = FakeRubric()
        prompt = evaluator._build_user_prompt(
            submission_text="My essay text.",
            rubrics=[rubric],
            retrieval_result=empty_retrieval,
            assignment=assignment,
        )
        assert assignment.title in prompt
        assert rubric.criteria_name in prompt
        assert "My essay text." in prompt

    def test_user_prompt_includes_notes_and_sample_chunks(
        self, evaluator: GradingEvaluator
    ) -> None:
        chunk = RetrievedChunk(
            chunk_text="Relevant note content",
            document_id="doc-1",
            doc_type="notes",
            relevance_score=0.1,
            chunk_index=0,
            source_name="notes.pdf",
        )
        retrieval = RetrievalResult(
            rubric_chunks=[], notes_chunks=[chunk], sample_chunks=[chunk], total_token_estimate=10
        )
        prompt = evaluator._build_user_prompt(
            submission_text="Text",
            rubrics=[FakeRubric()],
            retrieval_result=retrieval,
            assignment=FakeAssignment(),
        )
        assert "Relevant note content" in prompt
        assert "RELEVANT COURSE MATERIAL" in prompt
        assert "SAMPLE SOLUTION EXCERPTS" in prompt


class TestCreateFallbackEvaluation:
    def test_awards_half_points_per_criterion(
        self, evaluator: GradingEvaluator, empty_retrieval: RetrievalResult
    ) -> None:
        rubric = FakeRubric(max_points=Decimal("40"))
        result = evaluator._create_fallback_evaluation(
            [rubric], FakeAssignment(max_score=Decimal("100")), empty_retrieval
        )
        assert result.is_fallback is True
        assert result.confidence_score == 0.0
        assert result.criteria_scores[0]["awarded"] == 20.0
        assert result.total_score == 50.0
        assert result.percentage == 50.0

    def test_includes_source_names_from_retrieval(self, evaluator: GradingEvaluator) -> None:
        chunk = RetrievedChunk(
            chunk_text="x",
            document_id="d1",
            doc_type="notes",
            relevance_score=0.1,
            chunk_index=0,
            source_name="lecture1.pdf",
        )
        retrieval = RetrievalResult([], [chunk], [], 1)
        result = evaluator._create_fallback_evaluation([FakeRubric()], FakeAssignment(), retrieval)
        assert "lecture1.pdf" in result.retrieved_sources


class TestEvaluate:
    def test_gemini_exception_falls_back(
        self, evaluator: GradingEvaluator, empty_retrieval: RetrievalResult
    ) -> None:
        evaluator.model.generate_content.side_effect = RuntimeError("API down")
        result = evaluator.evaluate(
            submission_text="text",
            rubrics=[FakeRubric()],
            retrieval_result=empty_retrieval,
            assignment=FakeAssignment(),
        )
        assert result.is_fallback is True

    def test_valid_response_returns_parsed_result(
        self, evaluator: GradingEvaluator, empty_retrieval: RetrievalResult
    ) -> None:
        mock_response = MagicMock()
        mock_response.text = VALID_RESPONSE_JSON
        evaluator.model.generate_content.return_value = mock_response

        result = evaluator.evaluate(
            submission_text="text",
            rubrics=[FakeRubric()],
            retrieval_result=empty_retrieval,
            assignment=FakeAssignment(),
        )
        assert isinstance(result, EvaluationResult)
        assert result.is_fallback is False
        assert result.total_score == 85
        # Strengths/weaknesses capped at 3 even though 4/3 were provided.
        assert len(result.strengths) == 3
        assert len(result.weaknesses) == 3

    def test_malformed_response_triggers_retry_then_fallback(
        self, evaluator: GradingEvaluator, empty_retrieval: RetrievalResult
    ) -> None:
        bad_response = MagicMock()
        bad_response.text = "not valid json"
        # First call (main prompt) and the retry's call both return unparsable text.
        evaluator.model.generate_content.return_value = bad_response

        result = evaluator.evaluate(
            submission_text="text",
            rubrics=[FakeRubric()],
            retrieval_result=empty_retrieval,
            assignment=FakeAssignment(),
        )
        assert result.is_fallback is True

    def test_malformed_response_then_successful_retry(
        self, evaluator: GradingEvaluator, empty_retrieval: RetrievalResult
    ) -> None:
        bad_response = MagicMock()
        bad_response.text = "not valid json"
        good_response = MagicMock()
        good_response.text = VALID_RESPONSE_JSON

        evaluator.model.generate_content.side_effect = [bad_response, good_response]

        result = evaluator.evaluate(
            submission_text="text",
            rubrics=[FakeRubric()],
            retrieval_result=empty_retrieval,
            assignment=FakeAssignment(),
        )
        assert result.is_fallback is False
        assert result.confidence_score == 0.5  # retry path always sets 0.5
