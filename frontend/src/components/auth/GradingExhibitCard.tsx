import { cn } from "@/lib/utils";

interface GradingExhibitCardProps {
  /** Small eyebrow label, e.g. "Q3 · Cellular Biology". */
  label: string;
  /** The submission excerpt shown as the graded text. */
  excerpt: string;
  /** Optional substring of `excerpt` to mark with the oxblood grading underline. */
  highlight?: string;
  /** The awarded score, e.g. "8/10". */
  score: string;
  /** Italic margin note shown below the dashed divider. */
  note: string;
  className?: string;
}

/**
 * Splits the excerpt around `highlight` and marks the matched phrase with the
 * oxblood "grading underline". Purely presentational — no data logic.
 */
function ExcerptWithHighlight({ excerpt, highlight }: { excerpt: string; highlight?: string }) {
  if (!highlight) return <>{excerpt}</>;

  const index = excerpt.indexOf(highlight);
  if (index === -1) return <>{excerpt}</>;

  const before = excerpt.slice(0, index);
  const after = excerpt.slice(index + highlight.length);

  return (
    <>
      {before}
      <mark className="bg-transparent text-ink underline decoration-oxblood decoration-2 underline-offset-[3px]">
        {highlight}
      </mark>
      {after}
    </>
  );
}

/**
 * The annotated-submission "exhibit": a slightly rotated paper card showing a
 * graded excerpt (with an oxblood underline highlight), a circled score, and an
 * italic margin note below a dashed divider. All content is prop-driven so the
 * same card can be reused later on the evaluation review screen with real data.
 *
 * The single -1deg rotation + soft shadow is the one deliberate "physical paper"
 * touch — no other decoration.
 */
export function GradingExhibitCard({
  label,
  excerpt,
  highlight,
  score,
  note,
  className,
}: GradingExhibitCardProps) {
  return (
    <figure
      className={cn(
        "-rotate-1 rounded-[3px] border border-rule bg-paper-2 p-5 text-ink shadow-[0_18px_40px_-18px_rgba(27,36,48,0.55)] sm:p-6",
        className,
      )}
    >
      <figcaption className="mb-3 flex items-center justify-between gap-3">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {label}
        </span>
        <span
          aria-label={`Score ${score}`}
          className="inline-flex -rotate-2 items-center rounded-full border-2 border-oxblood px-3 py-1 font-serif text-base font-semibold text-oxblood"
        >
          {score}
        </span>
      </figcaption>

      <p className="font-serif text-[17px] leading-relaxed text-ink">
        <ExcerptWithHighlight excerpt={excerpt} highlight={highlight} />
      </p>

      <hr className="my-4 border-0 border-t border-dashed border-rule" />

      <p className="font-serif text-[15px] font-medium italic text-ink-soft">{note}</p>
    </figure>
  );
}
