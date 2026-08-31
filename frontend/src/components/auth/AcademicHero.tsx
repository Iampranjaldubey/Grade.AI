import { cn } from "@/lib/utils";

interface AcademicHeroProps {
  className?: string;
}

/**
 * Academic still-life illustration for the auth story panel: a graduation cap
 * resting above an open, graded book that sits on a stack of books.
 *
 * Colors are drawn only from the design-system palette (oxblood / rule / paper /
 * paper-2 / ink / muted) and chosen to read on the dark ink panel. Decorative
 * only — marked aria-hidden via role/label on the wrapper.
 */
export function AcademicHero({ className }: AcademicHeroProps) {
  return (
    <svg
      viewBox="0 0 360 300"
      role="img"
      aria-label="A graduation cap resting on an open, graded book atop a stack of books"
      className={cn("h-auto w-full", className)}
    >
      {/* soft paper glow behind the stack */}
      <ellipse cx="180" cy="250" rx="140" ry="16" fill="#F5F3EE" opacity="0.06" />

      {/* stack of books */}
      {/* bottom book (oxblood) */}
      <rect x="62" y="228" width="238" height="28" rx="6" fill="#9A2B25" />
      <rect x="62" y="228" width="238" height="7" rx="6" fill="#7E211D" />
      <rect x="70" y="246" width="222" height="5" rx="2" fill="#F5F3EE" opacity="0.85" />
      {/* middle book (paper/rule) */}
      <rect x="78" y="204" width="206" height="26" rx="6" fill="#DAD4C6" />
      <rect x="84" y="221" width="194" height="5" rx="2" fill="#6B6558" opacity="0.35" />
      {/* bookmark ribbon */}
      <path d="M248 204 h12 v34 l-6 -7 l-6 7 z" fill="#7E211D" />

      {/* open book resting on the stack */}
      <polygon
        points="92,196 180,184 180,204 92,212"
        fill="#FFFFFF"
        stroke="#1B2430"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <polygon
        points="180,184 268,196 268,212 180,204"
        fill="#FFFFFF"
        stroke="#1B2430"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <line x1="180" y1="184" x2="180" y2="204" stroke="#1B2430" strokeWidth="1.5" />
      {/* ruled lines - left page */}
      <line x1="104" y1="197" x2="168" y2="192" stroke="#6B6558" strokeWidth="1" opacity="0.55" />
      <line x1="104" y1="202" x2="168" y2="197" stroke="#6B6558" strokeWidth="1" opacity="0.55" />
      {/* ruled lines + grading marks - right page */}
      <line x1="192" y1="192" x2="256" y2="197" stroke="#6B6558" strokeWidth="1" opacity="0.55" />
      <line x1="192" y1="198" x2="240" y2="202" stroke="#9A2B25" strokeWidth="2" strokeLinecap="round" />
      {/* circled grade */}
      <ellipse
        cx="250"
        cy="190"
        rx="12"
        ry="9"
        fill="none"
        stroke="#9A2B25"
        strokeWidth="2"
        transform="rotate(-8 250 190)"
      />
      <text
        x="250"
        y="194"
        fill="#9A2B25"
        fontFamily="'Source Serif 4', Georgia, serif"
        fontSize="13"
        fontWeight="600"
        textAnchor="middle"
      >
        A
      </text>

      {/* graduation cap */}
      <polygon points="160,150 178,158 160,166 142,158" fill="#7E211D" />
      <polygon points="160,120 216,140 160,160 104,140" fill="#9A2B25" />
      <polygon points="160,120 216,140 160,150 104,140" fill="#7E211D" opacity="0.45" />
      <circle cx="160" cy="140" r="5" fill="#FFFFFF" />
      {/* tassel */}
      <path
        d="M160 140 C 198 143, 208 146, 208 152 L 208 176"
        fill="none"
        stroke="#DAD4C6"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect x="203" y="176" width="10" height="14" rx="4" fill="#DAD4C6" />
    </svg>
  );
}
