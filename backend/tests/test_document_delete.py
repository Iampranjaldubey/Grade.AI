"""
Tests for NEW-1: delete_document must delete the S3 object using the stored
file_key (not a key reconstructed by parsing the URL) and must remove the
document's embeddings from ChromaDB so vectors don't orphan.
"""

import uuid
from unittest.mock import MagicMock

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DocumentType, ParseStatus, UserRole
from app.models.document import Document


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


async def _seed_document(
    db_session: AsyncSession, course_id: str, uploader_id: str, *, file_key: str | None
) -> str:
    doc = Document(
        course_id=uuid.UUID(course_id),
        assignment_id=None,
        uploader_id=uuid.UUID(uploader_id),
        doc_type=DocumentType.NOTES,
        file_name="notes.pdf",
        file_url="http://minio:9000/bucket/whatever?X-Amz-Expired=1",
        file_key=file_key,
        mime_type="application/pdf",
        file_size_bytes=1234,
        parse_status=ParseStatus.SUCCESS,
    )
    db_session.add(doc)
    await db_session.commit()
    await db_session.refresh(doc)
    return str(doc.id)


@pytest.fixture
def mock_backends(monkeypatch):
    s3 = MagicMock()
    chroma = MagicMock()
    monkeypatch.setattr("app.api.v1.endpoints.uploads.get_s3_service", lambda settings: s3)
    monkeypatch.setattr("app.api.v1.endpoints.uploads.ChromaDBClient", lambda settings: chroma)
    return s3, chroma


@pytest.mark.asyncio
async def test_delete_uses_stored_file_key_and_cleans_chromadb(
    client: AsyncClient, db_session: AsyncSession, mock_backends
) -> None:
    s3, chroma = mock_backends
    prof = await _register(client, "p_del1@gradeai.com", UserRole.PROFESSOR)
    token = prof["access_token"]
    course = await _create_course(client, token, "DEL1")
    stored_key = f"{course['id']}/notes/{uuid.uuid4()}_notes.pdf"
    doc_id = await _seed_document(db_session, course["id"], prof["user"]["id"], file_key=stored_key)

    resp = await client.delete(
        f"/api/v1/uploads/{doc_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204, resp.text

    # S3 deletion uses the exact stored key, not a reconstructed one.
    s3.delete_file.assert_called_once_with(stored_key)
    # ChromaDB embeddings for this document are removed.
    chroma.delete_document_chunks.assert_called_once_with(f"gradeai_{course['id']}", doc_id)


@pytest.mark.asyncio
async def test_delete_without_file_key_skips_s3_but_still_deletes(
    client: AsyncClient, db_session: AsyncSession, mock_backends
) -> None:
    s3, chroma = mock_backends
    prof = await _register(client, "p_del2@gradeai.com", UserRole.PROFESSOR)
    token = prof["access_token"]
    course = await _create_course(client, token, "DEL2")
    doc_id = await _seed_document(db_session, course["id"], prof["user"]["id"], file_key=None)

    resp = await client.delete(
        f"/api/v1/uploads/{doc_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204, resp.text
    s3.delete_file.assert_not_called()  # no key -> don't guess


@pytest.mark.asyncio
async def test_delete_survives_chromadb_failure(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
) -> None:
    """A ChromaDB outage must not block deletion of the DB record + S3 object."""
    s3 = MagicMock()
    chroma = MagicMock()
    chroma.connect.side_effect = RuntimeError("chromadb down")
    monkeypatch.setattr("app.api.v1.endpoints.uploads.get_s3_service", lambda settings: s3)
    monkeypatch.setattr("app.api.v1.endpoints.uploads.ChromaDBClient", lambda settings: chroma)

    prof = await _register(client, "p_del3@gradeai.com", UserRole.PROFESSOR)
    token = prof["access_token"]
    course = await _create_course(client, token, "DEL3")
    doc_id = await _seed_document(
        db_session, course["id"], prof["user"]["id"], file_key=f"{course['id']}/notes/x_notes.pdf"
    )

    resp = await client.delete(
        f"/api/v1/uploads/{doc_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 204, resp.text
    s3.delete_file.assert_called_once()
