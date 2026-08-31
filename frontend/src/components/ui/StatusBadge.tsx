import {
  CheckCircle2,
  Clock,
  FileCheck2,
  Loader2,
  Sparkles,
  Send,
  AlertTriangle,
  XCircle,
  PencilRuler,
  Hand,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "./Badge";
import { cn } from "@/lib/utils";
import type {
  ApprovalStatus,
  GradingMode,
  ParseStatus,
  SubmissionStatus,
} from "@/types";

interface StatusMeta {
  tone: BadgeTone;
  label: string;
  icon: LucideIcon;
  spin?: boolean;
}

const submissionMeta: Record<SubmissionStatus, StatusMeta> = {
  submitted: { tone: "info", label: "Submitted", icon: Send },
  evaluating: { tone: "processing", label: "Evaluating", icon: Loader2, spin: true },
  evaluated: { tone: "success", label: "Graded", icon: CheckCircle2 },
  late: { tone: "danger", label: "Late", icon: AlertTriangle },
};

const parseMeta: Record<ParseStatus, StatusMeta> = {
  pending: { tone: "neutral", label: "Pending", icon: Clock },
  processing: { tone: "processing", label: "Processing", icon: Loader2, spin: true },
  success: { tone: "success", label: "Ready", icon: FileCheck2 },
  failed: { tone: "danger", label: "Failed", icon: XCircle },
};

const approvalMeta: Record<ApprovalStatus, StatusMeta> = {
  pending: { tone: "warning", label: "Awaiting review", icon: Sparkles },
  approved: { tone: "success", label: "Approved", icon: ShieldCheck },
  overridden: { tone: "brand", label: "Overridden", icon: PencilRuler },
};

const gradingModeMeta: Record<GradingMode, StatusMeta> = {
  auto: { tone: "info", label: "Auto", icon: Sparkles },
  manual: { tone: "neutral", label: "Manual", icon: Hand },
  hybrid: { tone: "processing", label: "Hybrid", icon: PencilRuler },
};

type StatusBadgeProps =
  | { kind: "submission"; value: SubmissionStatus; className?: string }
  | { kind: "parse"; value: ParseStatus; className?: string }
  | { kind: "approval"; value: ApprovalStatus; className?: string }
  | { kind: "gradingMode"; value: GradingMode; className?: string };

function resolve(props: StatusBadgeProps): StatusMeta {
  switch (props.kind) {
    case "submission":
      return submissionMeta[props.value];
    case "parse":
      return parseMeta[props.value];
    case "approval":
      return approvalMeta[props.value];
    case "gradingMode":
      return gradingModeMeta[props.value];
  }
}

/**
 * Single source of truth for domain status pills (submission / document parse /
 * evaluation approval / grading mode). Replaces the ad-hoc, duplicated badge
 * logic that previously lived in each page.
 */
export function StatusBadge(props: StatusBadgeProps) {
  const meta = resolve(props);
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} className={props.className}>
      <Icon className={cn("h-3.5 w-3.5", meta.spin && "motion-safe:animate-spin")} aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}
