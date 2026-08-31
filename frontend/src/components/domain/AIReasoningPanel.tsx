import { CheckCircle2, AlertTriangle, CircleSlash } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

interface AIReasoningPanelProps {
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  missingTopics?: string[] | null;
  className?: string;
  /** Heading shown above the groups. */
  title?: string;
}

/**
 * The AI's qualitative findings: strengths, areas to improve, and topics the
 * submission never covered. Renders nothing when the evaluation carries no
 * qualitative feedback, so callers don't need to guard.
 */
export function AIReasoningPanel({
  strengths,
  weaknesses,
  missingTopics,
  className,
  title = "Feedback summary",
}: AIReasoningPanelProps) {
  const hasStrengths = Boolean(strengths?.length);
  const hasWeaknesses = Boolean(weaknesses?.length);
  const hasMissing = Boolean(missingTopics?.length);

  if (!hasStrengths && !hasWeaknesses && !hasMissing) return null;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {hasStrengths && (
          <FindingGroup
            icon={CheckCircle2}
            label="Strengths"
            tone="success"
            items={strengths!}
          />
        )}
        {hasWeaknesses && (
          <FindingGroup
            icon={AlertTriangle}
            label="Areas to improve"
            tone="warning"
            items={weaknesses!}
          />
        )}
        {hasMissing && (
          <div>
            <GroupLabel icon={CircleSlash} label="Missing topics" tone="danger" />
            <ul className="flex flex-wrap gap-2">
              {missingTopics!.map((topic, i) => (
                <li key={`${topic}-${i}`}>
                  <Badge tone="danger">{topic}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const toneText: Record<string, string> = {
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
};

const toneBorder: Record<string, string> = {
  success: "border-success/30 bg-success-subtle/50",
  warning: "border-warning/30 bg-warning-subtle/50",
  danger: "border-danger/30 bg-danger-subtle/50",
};

function GroupLabel({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: string;
}) {
  return (
    <p
      className={cn(
        "mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]",
        toneText[tone],
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </p>
  );
}

function FindingGroup({
  icon,
  label,
  tone,
  items,
}: {
  icon: LucideIcon;
  label: string;
  tone: string;
  items: string[];
}) {
  return (
    <div>
      <GroupLabel icon={icon} label={label} tone={tone} />
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={`${label}-${i}`}
            className={cn(
              "rounded-md border px-3 py-2.5 text-sm leading-relaxed text-content-soft",
              toneBorder[tone],
            )}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
