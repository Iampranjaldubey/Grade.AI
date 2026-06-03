from app.core.enums import ApprovalStatus, GradingMode, UserRole


def test_user_role_values() -> None:
    assert UserRole.PROFESSOR.value == "professor"
    assert UserRole.TA.value == "ta"
    assert UserRole.ADMIN.value == "admin"


def test_grading_modes() -> None:
    assert set(GradingMode) == {GradingMode.AUTO, GradingMode.MANUAL, GradingMode.HYBRID}


def test_approval_status() -> None:
    assert ApprovalStatus.PENDING.value == "pending"
