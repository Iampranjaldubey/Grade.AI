import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AuthLayoutProps {
  /** Left dark "ink" panel content: headline + supporting copy. */
  story: ReactNode;
  /** Right light "paper" panel content: the form. */
  children: ReactNode;
  /** Widen the form column for denser forms (e.g. Register). */
  wide?: boolean;
}

/**
 * Split-screen authentication shell.
 * - Left: dark ink "story" panel (brand lockup + provided copy).
 * - Right: light paper panel with a centered form slot.
 * - Below 900px the panels stack and the story panel drops to a ~340px min-height.
 *
 * Layout/markup only — no auth, data, or form logic lives here.
 */
export function AuthLayout({ story, children, wide = false }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-paper font-sans text-ink min-[900px]:flex-row">
      {/* Story / brand panel */}
      <section className="relative flex min-h-[340px] flex-col justify-center overflow-hidden bg-ink px-6 py-10 text-paper min-[900px]:min-h-screen min-[900px]:w-[46%] min-[900px]:px-12 lg:px-16">
        {/* Scholarly ruled-notebook texture + margin line (decorative) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent, transparent 31px, rgba(218,212,198,0.06) 31px, rgba(218,212,198,0.06) 32px)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-8 w-px bg-oxblood/30 min-[900px]:left-12"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col">
          {/* Brand lockup */}
          <div className="mb-8 flex items-center gap-2.5 min-[900px]:mb-10">
            <span
              aria-hidden="true"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] bg-oxblood font-serif text-sm font-bold text-paper-2"
            >
              G
            </span>
            <span className="font-serif text-lg font-semibold tracking-tight text-paper">
              GradeAI
            </span>
          </div>

          {story}
        </div>
      </section>

      {/* Form panel */}
      <section className="flex flex-1 items-center justify-center bg-paper px-6 py-10 min-[900px]:px-10 lg:px-16">
        <div className={cn("w-full", wide ? "max-w-xl" : "max-w-md")}>{children}</div>
      </section>
    </div>
  );
}
