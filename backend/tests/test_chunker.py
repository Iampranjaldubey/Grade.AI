"""
Tests for app.rag.chunker: word-based and sentence-based text chunking.
"""

from app.rag.chunker import chunk_text, chunk_text_by_sentences, count_tokens


class TestCountTokens:
    def test_empty_string(self) -> None:
        assert count_tokens("") == 0

    def test_counts_words_with_multiplier(self) -> None:
        # 10 words * 1.3 = 13
        text = " ".join(["word"] * 10)
        assert count_tokens(text) == 13


class TestChunkText:
    def test_empty_input_returns_empty_list(self) -> None:
        assert chunk_text("") == []

    def test_whitespace_only_returns_empty_list(self) -> None:
        assert chunk_text("   \n\t  ") == []

    def test_short_text_returns_single_chunk(self) -> None:
        text = "This is a short piece of text."
        chunks = chunk_text(text, chunk_size=500, overlap=50)
        assert len(chunks) == 1
        assert chunks[0]["chunk_index"] == 0
        assert chunks[0]["text"] == text
        assert chunks[0]["char_count"] == len(text)
        assert chunks[0]["token_count"] == count_tokens(text)

    def test_long_text_splits_into_multiple_chunks(self) -> None:
        # 2000 words, chunk_size=100 tokens (~76 words/chunk) -> several chunks.
        text = " ".join(f"word{i}" for i in range(2000))
        chunks = chunk_text(text, chunk_size=100, overlap=20)
        assert len(chunks) > 1
        # Chunk indices are sequential starting at 0.
        assert [c["chunk_index"] for c in chunks] == list(range(len(chunks)))

    def test_chunks_overlap_in_content(self) -> None:
        text = " ".join(f"word{i}" for i in range(300))
        chunks = chunk_text(text, chunk_size=100, overlap=30)
        assert len(chunks) >= 2
        first_words = chunks[0]["text"].split()
        second_words = chunks[1]["text"].split()
        # The tail of the first chunk should reappear at the head of the second.
        assert set(first_words[-5:]) & set(second_words[:20])

    def test_minimum_chunk_size_enforced(self) -> None:
        # Even with a tiny chunk_size, the implementation floors word count at 50.
        text = " ".join(f"w{i}" for i in range(120))
        chunks = chunk_text(text, chunk_size=1, overlap=0)
        # First chunk should contain at least 50 words (the enforced minimum).
        assert len(chunks[0]["text"].split()) >= 50

    def test_single_word_input(self) -> None:
        chunks = chunk_text("hello")
        assert len(chunks) == 1
        assert chunks[0]["text"] == "hello"


class TestChunkTextBySentences:
    def test_empty_input_returns_a_single_empty_chunk(self) -> None:
        # re.split on an empty string yields [""], so this falls through to a
        # single chunk with empty text rather than an empty chunk list.
        chunks = chunk_text_by_sentences("")
        assert len(chunks) == 1
        assert chunks[0]["text"] == ""

    def test_single_sentence(self) -> None:
        text = "This is one sentence."
        chunks = chunk_text_by_sentences(text, chunk_size=500, overlap=50)
        assert len(chunks) == 1
        assert chunks[0]["text"] == text

    def test_multiple_sentences_within_budget_share_a_chunk(self) -> None:
        text = "First sentence here. Second sentence here. Third sentence here."
        chunks = chunk_text_by_sentences(text, chunk_size=500, overlap=50)
        assert len(chunks) == 1
        assert "First" in chunks[0]["text"]
        assert "Third" in chunks[0]["text"]

    def test_splits_when_exceeding_chunk_size(self) -> None:
        # Each sentence is ~7 tokens; force a split with a small chunk_size.
        sentence = "This is a moderately long sentence for testing purposes."
        text = " ".join([sentence] * 20)
        chunks = chunk_text_by_sentences(text, chunk_size=30, overlap=5)
        assert len(chunks) > 1
        assert [c["chunk_index"] for c in chunks] == list(range(len(chunks)))

    def test_chunk_indices_and_fields_are_consistent(self) -> None:
        sentence = "Another test sentence for chunking behavior."
        text = " ".join([sentence] * 10)
        chunks = chunk_text_by_sentences(text, chunk_size=20, overlap=5)
        for chunk in chunks:
            assert chunk["char_count"] == len(chunk["text"])
            assert chunk["token_count"] == count_tokens(chunk["text"])
