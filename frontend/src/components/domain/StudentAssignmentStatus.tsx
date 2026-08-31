import { CheckCircle2, Clock, FileWarning, Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui";
import { isPastDue } from "@/lib/utils";
import type { SubmissionOut } from "@/types";

interface StudentAssignmentStatusProps {
  submission: SubmissionOut | null | undefined;
  dueDate: string;
}

/**
 * A student's status for one assignment, combining their submission state with
 * the due date (so an unsubmitted, past-due assignment reads as "Missing"
 * rather than a neutral "Not submitted").
 */
export function StudentAssignmentStatus({
  submission,
  dueDate,
}: StudentAssignmentStatusProps) {
  if (!submission) {
    return isPastDue(dueDate) ? (
      <Badge tone="danger">
        <FileWarning className="h-3.5 w-3.5" aria-hidden="true" />
        Missing
      </Badge>
    ) : (
      <Badge tone="neutral">
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        Not submitted
      </Badge>
    );
  }

  if (submission.status === "evaluated") {
    return (
      <Badge tone="success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Graded
      </Badge>
    );
  }

  if (submission.status === "evaluating") {
    return (
      <Badge tone="processing">
        <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
        Grading
      </Badge>
    );
  }

  return (
    <Badge tone="info">
      <Send className="h-3.5 w-3.5" aria-hidden="true" />
      Submitted
    </Badge>
  );
}
