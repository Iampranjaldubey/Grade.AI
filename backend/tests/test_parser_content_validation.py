"""
Tests for Finding #13: parse_document validates that file content (magic bytes)
matches the declared MIME type, so a file merely renamed to .pdf/.docx is
rejected before being handed to pdfplumber / python-docx.
"""
import pytest

from app.rag.parsers import parse_document

_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def test_non_pdf_content_declared_as_pdf_is_rejected() -> None:
    with pytest.raises(ValueError) as exc:
        parse_document(b"GIF89a this is definitely not a pdf", "application/pdf")
    assert "does not match" in str(exc.value)


def test_non_zip_content_declared_as_docx_is_rejected() -> None:
    with pytest.raises(ValueError) as exc:
        parse_document(b"plain text pretending to be docx", _DOCX_MIME)
    assert "does not match" in str(exc.value)


def test_unsupported_mime_still_rejected() -> None:
    with pytest.raises(ValueError) as exc:
        parse_document(b"anything", "image/png")
    assert "Unsupported MIME type" in str(exc.value)


def test_plain_text_is_accepted_and_parsed() -> None:
    text = parse_document(b"Hello world, this is a plain text submission.", "text/plain")
    assert "Hello world" in text


def test_pdf_magic_bytes_pass_content_gate() -> None:
    # Starts with %PDF- so it passes the content gate; pdfplumber then fails to
    # parse the bogus body -> still a ValueError, but NOT the mismatch message.
    with pytest.raises(ValueError) as exc:
        parse_document(b"%PDF-1.4 not really a valid pdf body", "application/pdf")
    assert "does not match" not in str(exc.value)
