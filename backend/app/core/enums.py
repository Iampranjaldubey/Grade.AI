from enum import StrEnum


class AppEnvironment(StrEnum):
    DEVELOPMENT = "development"
    PRODUCTION = "production"
    TEST = "test"


class UserRole(StrEnum):
    PROFESSOR = "professor"
    STUDENT = "student"
    TA = "ta"
    ADMIN = "admin"


class EnrollmentStatus(StrEnum):
    ACTIVE = "active"
    DROPPED = "dropped"


class GradingMode(StrEnum):
    AUTO = "auto"
    MANUAL = "manual"
    HYBRID = "hybrid"


class DocumentType(StrEnum):
    RUBRIC = "rubric"
    NOTES = "notes"
    SAMPLE_SOLUTION = "sample_solution"
    SUBMISSION = "submission"


class ParseStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    SUCCESS = "success"
    FAILED = "failed"


class SubmissionStatus(StrEnum):
    SUBMITTED = "submitted"
    EVALUATING = "evaluating"
    EVALUATED = "evaluated"
    LATE = "late"


class ApprovalStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    OVERRIDDEN = "overridden"
