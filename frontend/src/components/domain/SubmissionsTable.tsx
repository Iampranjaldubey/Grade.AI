import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileText, Play, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { evaluationsApi, getErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DataTable,
  EmptyState,
  StatusBadge,
  type Column,
} from "@/components/ui";
import type { EvaluationOut, SubmissionOut } from "@/types";

export type SubmissionWithStudent = SubmissionOut & {
  student_name: string;
  student_email: string;
};

interface SubmissionsTableProps {
  assignmentId: string;
  submissions: SubmissionWithStudent[];
  isLoading?: boolean;
}

/**
 * Submissions for one assignment, with per-row and bulk AI grading.
 *
 * Two fixes over the previous implementation:
 *  - Evaluations are fetched in a **single** query (concurrently) rather than one
 *    `useQuery` per table row, which previously produced an N+1 request pattern
 *    and made every row refetch independently.
 *  - Triggering grading no longer schedules a `setTimeout` refresh; the parent
 *    query polls while any submission is still being evaluated.
 */
export function SubmissionsTable({
  assignmentId,
  submissions,
  isLoading = false,
}: SubmissionsTableProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmBulk, setConfirmBulk] = useState(false);

  const gradedIds = submissions
    .filter((s) => s.status === "evaluated")
    .map((s) => s.id);

  // One query for every graded submission's evaluation (requests run in
  // parallel). No batch endpoint exists, but this keeps it to a single cache
  // entry instead of a query per row.
  const { data: evaluations = {} } = useQuery({
    queryKey: ["submission-evaluations", assignmentId, gradedIds],
    queryFn: async (): Promise<Record<string, EvaluationOut | null>> => {
      const entries = await Promise.all(
        gradedIds.map(async (id) => {
          try {
            return [id, await evaluationsApi.getMyGrade(id)] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      );
      return Object.fromEntries(entries);
    },
    enabled: gradedIds.length > 0,
  });

  const triggerMutation = useMutation({
    mutationFn: (submissionId: string) => evaluationsApi.trigger(submissionId),
    onSuccess: () => {
      // The submission flips to "evaluating"; the list query polls from there.
      queryClient.invalidateQueries({ queryKey: ["submissions", assignmentId] });
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "Failed to start grading")),
  });

  const ungraded = submissions.filter((s) => s.status === "submitted");

  const handleGradeAll = async () => {
    setConfirmBulk(false);
    const results = await Promise.allSettled(
      ungraded.map((s) => triggerMutation.mutateAsync(s.id)),
    );
    const started = results.filter((r) => r.status === "fulfilled").length;
    if (started > 0) {
      toast.success(
        `AI grading started for ${started} ${started === 1 ? "submission" : "submissions"}`,
      );
    }
  };

  const columns: Column<SubmissionWithStudent>[] = [
    {
      id: "student",
      header: "Student",
      sortValue: (s) => s.student_name,
      cell: (s) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-content">{s.student_name}</div>
          <div className="truncate text-xs text-content-muted">{s.student_email}</div>
        </div>
      ),
    },
    {
      id: "submitted",
      header: "Submitted",
      sortValue: (s) => new Date(s.submitted_at).getTime(),
      cell: (s) => (
        <span className="whitespace-nowrap text-content-muted">
          {formatDateTime(s.submitted_at)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (s) => s.status,
      cell: (s) => <StatusBadge kind="submission" value={s.status} />,
    },
    {
      id: "score",
      header: "AI score",
      sortValue: (s) => {
        const value = evaluations[s.id]?.final_score ?? evaluations[s.id]?.ai_score;
        return value ? parseFloat(value) : -1;
      },
      cell: (s) => {
        const evaluation = evaluations[s.id];
        const score = evaluation?.final_score ?? evaluation?.ai_score;
        return score ? (
          <span className="font-serif text-base font-semibold text-content">
            {score}
          </span>
        ) : (
          <span className="text-content-muted">—</span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (s) => {
        const evaluation = evaluations[s.id];
        return (
          <div className="flex items-center justify-end gap-2">
            {s.status === "submitted" && (
              <Button
                size="sm"
                onClick={() => triggerMutation.mutate(s.id)}
                isLoading={
                  triggerMutation.isPending && triggerMutation.variables === s.id
                }
              >
                <Play className="h-4 w-4" />
                Grade
              </Button>
            )}
            {evaluation && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/professor/evaluations/${evaluation.id}`)}
              >
                <Eye className="h-4 w-4" />
                Review
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Submissions</CardTitle>
          <p className="mt-0.5 text-sm text-content-muted">
            {submissions.length}{" "}
            {submissions.length === 1 ? "submission" : "submissions"}
            {ungraded.length > 0 && ` · ${ungraded.length} awaiting grading`}
          </p>
        </div>
        {ungraded.length > 0 && (
          <Button
            className="flex-shrink-0"
            onClick={() => setConfirmBulk(true)}
            disabled={triggerMutation.isPending}
          >
            <Sparkles className="h-4 w-4" />
            Grade all ({ungraded.length})
          </Button>
        )}
      </CardHeader>

      <CardContent>
        <DataTable
          data={submissions}
          columns={columns}
          getRowId={(s) => s.id}
          isLoading={isLoading}
          searchable={(s) => `${s.student_name} ${s.student_email}`}
          searchPlaceholder="Search students…"
          caption="Student submissions for this assignment"
          empty={
            <EmptyState
              icon={FileText}
              title="No submissions yet"
              description="Once students submit their work it will appear here, ready for AI grading."
            />
          }
        />
      </CardContent>

      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title={`Start AI grading for ${ungraded.length} ${
          ungraded.length === 1 ? "submission" : "submissions"
        }?`}
        description="GradeAI will draft a score and feedback for each one. Nothing is released to students until you review and approve it."
        confirmLabel="Start grading"
        onConfirm={handleGradeAll}
      />
    </Card>
  );
}
