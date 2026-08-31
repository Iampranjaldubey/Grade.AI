import type { DocumentOut } from "@/types";

const POLL_MS = 5000;

/**
 * `refetchInterval` predicate for document lists: keeps polling while any
 * document is still being parsed, then stops.
 *
 * Replaces the duplicated `useEffect` + `setInterval` blocks that previously
 * lived in the course and assignment detail pages, and matches the polling
 * pattern already used for single-document status elsewhere.
 */
export function pollWhileParsing(
  documents: DocumentOut[] | undefined,
): number | false {
  if (!documents?.length) return false;
  const stillParsing = documents.some(
    (doc) => doc.parse_status === "pending" || doc.parse_status === "processing",
  );
  return stillParsing ? POLL_MS : false;
}
