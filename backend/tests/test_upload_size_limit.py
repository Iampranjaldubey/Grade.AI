"""
Tests for Finding #11 fix: uploads are capped at settings.max_upload_size_bytes.

- /uploads/presign fast-fails (413) on a client-declared oversized file before
  issuing an upload URL (no S3 needed).
- /uploads/confirm enforces the limit against the ACTUAL stored object size
  (via S3 head_object), deleting the oversized object and returning 413.

The S3 layer is mocked for the confirm test so no live MinIO is required.
"""
import uuid
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.enums import DocumentType, UserRole
from app.models.course import Course


async def _register(client: AsyncClient, email: str, role: UserRole, name: str = "U") -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "securepass123", "name": name, "role": role.value},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_course(client: AsyncClient, token: str, code: str) -> dict:
    resp = await client.post(
        "/api/v1/courses",
        headers={"Authorization": f"Bearer {token}"},
        json={"course_name": "C", "course_code": code, "semester": "Fall 2026"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_presign_rejects_oversized_declared_size(client: AsyncClient) -> None:
    prof = await _register(client, "p_sz1@gradeai.com", UserRole.PROFESSOR)
    token = prof["access_token"]
    course = await _create_course(client, token, "SZ1")

    cap = get_settings().max_upload_size_bytes
    resp = await client.post(
        "/api/v1/uploads/presign",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "file_name": "huge.pdf",
            "content_type": "application/pdf",
            "doc_type": DocumentType.NOTES.value,
            "course_id": course["id"],
            "file_size_bytes": cap + 1,
        },
    )
    assert resp.status_code == 413, resp.text


@pytest.mark.asyncio
async def test_confirm_rejects_oversized_actual_object(
    client: AsyncClient, monkeypatch
) -> None:
    prof = await _register(client, "p_sz2@gradeai.com", UserRole.PROFESSOR)
    token = prof["access_token"]
    course = await _create_course(client, token, "SZ2")

    cap = get_settings().max_upload_size_bytes

    # Mock the S3 layer: file exists, but its actual size exceeds the cap.
    fake_s3 = MagicMock()
    fake_s3.file_exists.return_value = True
    fake_s3.get_file_size.return_value = cap + 1
    monkeypatch.setattr(
        "app.api.v1.endpoints.uploads.get_s3_service", lambda settings: fake_s3
    )

    resp = await client.post(
        "/api/v1/uploads/confirm",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "file_key": f"{course['id']}/notes/{uuid.uuid4()}_huge.pdf",
            "file_name": "huge.pdf",
            "file_size_bytes": 1000,  # client lies; actual size is what matters
            "doc_type": DocumentType.NOTES.value,
            "course_id": course["id"],
        },
    )
    assert resp.status_code == 413, resp.text
    # Oversized object must be deleted from storage.
    fake_s3.delete_file.assert_called_once()


@pytest.mark.asyncio
async def test_confirm_accepts_within_limit(client: AsyncClient, monkeypatch) -> None:
    prof = await _register(client, "p_sz3@gradeai.com", UserRole.PROFESSOR)
    token = prof["access_token"]
    course = await _create_course(client, token, "SZ3")

    fake_s3 = MagicMock()
    fake_s3.file_exists.return_value = True
    fake_s3.get_file_size.return_value = 2048  # well under the cap
    fake_s3.generate_presigned_download_url.return_value = "http://example.com/dl"
    monkeypatch.setattr(
        "app.api.v1.endpoints.uploads.get_s3_service", lambda settings: fake_s3
    )

    resp = await client.post(
        "/api/v1/uploads/confirm",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "file_key": f"{course['id']}/notes/{uuid.uuid4()}_ok.pdf",
            "file_name": "ok.pdf",
            "file_size_bytes": 2048,
            "doc_type": DocumentType.NOTES.value,
            "course_id": course["id"],
        },
    )
    assert resp.status_code == 201, resp.text
    fake_s3.delete_file.assert_not_called()
