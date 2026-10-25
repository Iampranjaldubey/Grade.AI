"""
Tests for app.rag.evaluator.GradingEvaluator: prompt building, structured
response validation, server-side scoring, retry / fallback-model control flow,
and the flagged placeholder.

A fake google-genai client is injected, so no network call is ever made.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import httpx
import pytest
from google.genai import errors

from app.core.config import Settings
from app.core.enums import GradingMode
from app.rag.evaluator import (
    ATTEMPTS_PER_MODEL,
    CriterionAssessment,
    EvaluationResult,
    GradingEvaluator,
    GradingResponse,
)
from app.rag.retrieval import RetrievalResult, RetrievedChunk

PRIMARY = "primary-model"
FALLBACK = "fallback-model"


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


def two_rubrics() -> list[FakeRubric]:
    return [
        FakeRubric(criteria_name="Content", max_points=Decimal("60"), weight=Decimal("60")),
        FakeRubric(criteria_name="Clarity", max_points=Decimal("40"), weight=Decimal("40")),
    ]


def grading_response(**overrides: Any) -> GradingResponse:
    data: dict[str, Any] = {
        "criteria_scores": [
            CriterionAssessment(criterion_name="Content", awarded=50, reasoning="Solid argument."),
            CriterionAssessment(criterion_name="Clarity", awarded=30, reasoning="Mostly clear."),
        ],
        "strengths": ["Clear thesis", "Good examples", "Strong conclusion", "Extra one"],
        "weaknesses": ["Minor grammar issues"],
        "missing_topics": [],
        "overall_feedback": "Well done overall.",
        "confidence_score": 0.9,
    }
    data.update(overrides)
    return GradingResponse(**data)


def ok(parsed: GradingResponse) -> SimpleNamespace:
    """A successful SDK response whose JSON validated against the schema."""
    return SimpleNamespace(parsed=parsed, text=parsed.model_dump_json(), candidates=[])


def unparsable(text: str = "not json", finish_reason: str = "MAX_TOKENS") -> SimpleNamespace:
    return SimpleNamespace(
        parsed=None, text=text, candidates=[SimpleNamespace(finish_reason=finish_reason)]
    )


def server_error(code: int = 503) -> errors.ServerError:
    return errors.ServerError(code, {"error": {"code": code, "message": "high demand"}})


def client_error(code: int) -> errors.ClientError:
    return errors.ClientError(code, {"error": {"code": code, "message": "nope"}})


@pytest.fixture
def client() -> MagicMock:
    return MagicMock()


@pytest.fixture
def sleeps() -> list[float]:
    return []


@pytest.fixture
def evaluator(client: MagicMock, sleeps: list[float]) -> GradingEvaluator:
    settings = Settings(
        GEMINI_API_KEY="test-key", GEMINI_MODEL=PRIMARY, GEMINI_FALLBACK_MODEL=FALLBACK
    )
    return GradingEvaluator(settings, client=client, sleep=sleeps.append)


@pytest.fixture
def empty_retrieval() -> RetrievalResult:
    return RetrievalResult(
        rubric_chunks=[], notes_chunks=[], sample_chunks=[], total_token_estimate=0
    )


def run(evaluator: GradingEvaluator, retrieval: RetrievalResult, rubrics=None) -> EvaluationResult:
    return evaluator.evaluate(
        submission_text="My essay text.",
        rubrics=rubrics if rubrics is not None else two_rubrics(),
        retrieval_result=retrieval,
        assignment=FakeAssignment(),
    )


def models_called(client: MagicMock) -> list[str]:
    return [c.kwargs["model"] for c in client.models.generate_content.call_args_list]


class TestConfiguration:
    def test_without_api_key_returns_placeholder_without_calling_api(
        self, empty_retrieval: RetrievalResult
    ) -> None:
        evaluator = GradingEvaluator(Settings(GEMINI_API_KEY=""))
        assert evaluator.client is None
        result = run(evaluator, empty_retrieval)
        assert result.is_fallback is True

    def test_duplicate_or_blank_fallback_model_is_not_tried_twice(self, client) -> None:
        same = GradingEvaluator(
            Settings(GEMINI_API_KEY="k", GEMINI_MODEL=PRIMARY, GEMINI_FALLBACK_MODEL=PRIMARY),
            client=client,
        )
        blank = GradingEvaluator(
            Settings(GEMINI_API_KEY="k", GEMINI_MODEL=PRIMARY, GEMINI_FALLBACK_MODEL=""),
            client=client,
        )
        assert same.models == [PRIMARY]
        assert blank.models == [PRIMARY]

    def test_request_uses_structured_output(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        client.models.generate_content.return_value = ok(grading_response())
        run(evaluator, empty_retrieval)

        config = client.models.generate_content.call_args.kwargs["config"]
        assert config.response_mime_type == "application/json"
        assert config.response_schema is GradingResponse
        assert "expert academic evaluator" in config.system_instruction


class TestScoring:
    def test_valid_response_is_scored_from_the_rubric(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        client.models.generate_content.return_value = ok(grading_response())
        result = run(evaluator, empty_retrieval)

        assert result.is_fallback is False
        assert result.model_name == PRIMARY
        assert result.total_score == 80.0  # 50 + 30, computed here, not trusted from the model
        assert result.max_score == 100.0
        assert result.percentage == 80.0
        assert [c["max"] for c in result.criteria_scores] == [60.0, 40.0]
        assert result.confidence_score == 0.9
        assert len(result.strengths) == 3  # capped at 3

    def test_awarded_points_are_clamped_to_criterion_range(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        parsed = grading_response(
            criteria_scores=[
                CriterionAssessment(criterion_name="Content", awarded=75, reasoning="r"),
                CriterionAssessment(criterion_name="Clarity", awarded=-5, reasoning="r"),
            ],
            confidence_score=1.7,
        )
        client.models.generate_content.return_value = ok(parsed)
        result = run(evaluator, empty_retrieval)

        assert [c["awarded"] for c in result.criteria_scores] == [60.0, 0.0]
        assert result.total_score == 60.0
        assert result.confidence_score == 1.0

    def test_criterion_names_match_case_insensitively_and_use_rubric_spelling(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        parsed = grading_response(
            criteria_scores=[
                # Out of order, different case, extra whitespace, plus an extra criterion.
                CriterionAssessment(criterion_name=" clarity ", awarded=20, reasoning="b"),
                CriterionAssessment(criterion_name="CONTENT", awarded=40, reasoning="a"),
                CriterionAssessment(criterion_name="Invented", awarded=99, reasoning="x"),
            ]
        )
        client.models.generate_content.return_value = ok(parsed)
        result = run(evaluator, empty_retrieval)

        assert [c["criterion_name"] for c in result.criteria_scores] == ["Content", "Clarity"]
        assert [c["reasoning"] for c in result.criteria_scores] == ["a", "b"]
        assert result.total_score == 60.0  # the invented criterion is ignored

    def test_raw_text_is_validated_when_sdk_did_not_parse(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        response = ok(grading_response())
        response.parsed = None
        client.models.generate_content.return_value = response
        result = run(evaluator, empty_retrieval)
        assert result.is_fallback is False
        assert result.total_score == 80.0

    def test_sources_are_collected_from_retrieval(
        self, evaluator: GradingEvaluator, client: MagicMock
    ) -> None:
        chunk = RetrievedChunk("x", "d1", "notes", 0.1, 0, "lecture1.pdf")
        retrieval = RetrievalResult([], [chunk], [], 1)
        client.models.generate_content.return_value = ok(grading_response())
        result = run(evaluator, retrieval)
        assert result.retrieved_sources == ["lecture1.pdf"]


class TestRetryAndFallbackModel:
    def test_transient_error_is_retried_on_the_same_model(
        self,
        evaluator: GradingEvaluator,
        client: MagicMock,
        sleeps: list[float],
        empty_retrieval: RetrievalResult,
    ) -> None:
        client.models.generate_content.side_effect = [server_error(503), ok(grading_response())]
        result = run(evaluator, empty_retrieval)

        assert result.is_fallback is False
        assert result.model_name == PRIMARY
        assert models_called(client) == [PRIMARY, PRIMARY]
        assert len(sleeps) == 1

    def test_overloaded_primary_falls_back_to_secondary_model(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        client.models.generate_content.side_effect = [server_error(504)] * ATTEMPTS_PER_MODEL + [
            ok(grading_response())
        ]
        result = run(evaluator, empty_retrieval)

        assert result.is_fallback is False
        assert result.model_name == FALLBACK
        assert models_called(client) == [PRIMARY] * ATTEMPTS_PER_MODEL + [FALLBACK]

    def test_retired_model_skips_straight_to_fallback_without_retrying(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        client.models.generate_content.side_effect = [client_error(404), ok(grading_response())]
        result = run(evaluator, empty_retrieval)

        assert result.model_name == FALLBACK
        assert models_called(client) == [PRIMARY, FALLBACK]

    def test_network_timeout_is_retried(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        client.models.generate_content.side_effect = [
            httpx.ReadTimeout("timed out"),
            ok(grading_response()),
        ]
        result = run(evaluator, empty_retrieval)
        assert result.is_fallback is False
        assert models_called(client) == [PRIMARY, PRIMARY]

    def test_truncated_or_invalid_output_is_retried(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        client.models.generate_content.side_effect = [unparsable(), ok(grading_response())]
        result = run(evaluator, empty_retrieval)
        assert result.is_fallback is False
        assert models_called(client) == [PRIMARY, PRIMARY]

    def test_response_missing_a_rubric_criterion_is_retried(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        incomplete = grading_response(
            criteria_scores=[
                CriterionAssessment(criterion_name="Content", awarded=50, reasoning="r")
            ]
        )
        client.models.generate_content.side_effect = [ok(incomplete), ok(grading_response())]
        result = run(evaluator, empty_retrieval)
        assert result.is_fallback is False
        assert result.total_score == 80.0
        assert models_called(client) == [PRIMARY, PRIMARY]


class TestPlaceholder:
    def test_every_attempt_failing_yields_flagged_placeholder(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        client.models.generate_content.side_effect = server_error(503)
        result = run(evaluator, empty_retrieval)

        assert result.is_fallback is True
        assert result.model_name is None
        assert result.confidence_score == 0.0
        assert len(models_called(client)) == 2 * ATTEMPTS_PER_MODEL

    def test_invalid_api_key_stops_immediately(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        client.models.generate_content.side_effect = client_error(403)
        result = run(evaluator, empty_retrieval)

        assert result.is_fallback is True
        assert models_called(client) == [PRIMARY]  # no retry, no fallback model

    def test_unexpected_exception_never_escapes(
        self, evaluator: GradingEvaluator, client: MagicMock, empty_retrieval: RetrievalResult
    ) -> None:
        client.models.generate_content.side_effect = RuntimeError("SDK bug")
        result = run(evaluator, empty_retrieval)
        assert result.is_fallback is True

    def test_placeholder_awards_half_points_per_criterion(
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
        chunk = RetrievedChunk("Relevant note content", "doc-1", "notes", 0.1, 0, "notes.pdf")
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
