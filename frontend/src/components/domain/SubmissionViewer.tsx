import { ExternalLink, FileText, User } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  StatusBadge,
  buttonClasses,
} from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import type { SubmissionStatus } from "@/types";

interface SubmissionViewerProps {
  studentName?: string;
  studentEmail?: string;
  fileName?: string;
  fileUrl?: string;
  submittedAt?: string;
  status?: SubmissionStatus;
  isLoading?: boolean;
  /** Explains why no document is shown when file details are unavailable. */
  unavailableNote?: string;
  className?: string;
  title?: string;
}

/**
 * The work being graded.
 *
 * The previous evaluation review screen never showed the submission at all —
 * professors approved or overrode a grade without seeing the student's work.
 *
 * Every field is optional because the available detail differs by caller: the
 * evaluation detail endpoint currently returns no file information, while the
 * assignment and student views do. Only what is known gets rendered.
 */
export function SubmissionViewer({
  studentName,
  studentEmail,
  fileName,
  fileUrl,
  submittedAt,
  status,
  isLoading = false,
  unavailableNote,
  className,
  title = "Submission",
}: SubmissionViewerProps) {
  const hasStudent = Boolean(studentName || studentEmail);
  const hasFile = Boolean(fileName);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {status && <StatusBadge kind="submission" value={status} />}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            {hasStudent && (
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface-sunken text-content-soft"
                >
                  <User className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-content">
                    {studentName || "Student"}
                  </p>
                  {studentEmail && (
                    <p className="truncate text-sm text-content-muted">
                      {studentEmail}
                    </p>
                  )}
                </div>
              </div>
            )}

            {hasFile ? (
              <div className="rounded-md border border-edge bg-surface-raised p-4">
                <div className="flex items-start gap-3">
                  <FileText
                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-content-muted"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium text-content">{fileName}</p>
                    {submittedAt && (
                      <p className="mt-0.5 text-sm text-content-muted">
                        Submitted {formatDateTime(submittedAt)}
                      </p>
                    )}
                  </div>
                </div>

                {fileUrl && (
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClasses({
                      variant: "outline",
                      size: "sm",
                      className: "mt-4",
                    })}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Open document
                  </a>
                )}
              </div>
            ) : (
              unavailableNote && (
                <div className="rounded-md border border-dashed border-edge-strong bg-surface-raised px-4 py-5 text-center">
                  <FileText
                    className="mx-auto mb-2 h-6 w-6 text-content-muted"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-content-muted">{unavailableNote}</p>
                </div>
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
