import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  PencilRuler,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { evaluationsApi, getErrorMessage } from "@/lib/api";
import { AppShell } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Skeleton,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import {
  AIReasoningPanel,
  ConfidenceMeter,
  GradeDisplay,
  RubricCriterionRow,
  SubmissionViewer,
} from "@/components/domain";
import { formatDateTime } from "@/lib/utils";
import type { EvaluationListOut, EvaluationOut } from "@/types";

const overrideSchema = z.object({
  final_score: z.coerce.number().min(0, "Score must be non-negative"),
  professor_feedback: z
    .string()
    .min(10, "Please explain the override in at least 10 characters"),
});

type OverrideFormData = z.infer<typeof overrideSchema>;

export function EvaluationReviewPage() {
  const { evaluationId } = useParams<{ evaluationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Tracks an in-flight re-evaluation so we can poll until a new result lands
  // (replacing the previous fixed `setTimeout` refresh).
  const [reEvaluatingSince, setReEvaluatingSince] = useState<string | null>(null);
  const [isOverriding, setIsOverriding] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"approve" | "override" | null>(
    null,
  );

  const {
    data: evaluation,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["evaluation", evaluationId],
    queryFn: () => evaluationsApi.getDetail(evaluationId!),
    enabled: !!evaluationId,
    refetchInterval: (query) => {
      if (!reEvaluatingSince) return false;
      const current = query.state.data;
      // Stop as soon as the evaluation timestamp changes.
      if (current && current.evaluated_at !== reEvaluatingSince) return false;
      return 3000;
    },
  });

  // Student / assignment identity isn't part of EvaluationOut, but the pending
  // queue carries it. Same query key as the shell, so this is a cache read.
  const { data: pendingList = [] } = useQuery({
    queryKey: ["evaluations", "pending"],
    queryFn: () => evaluationsApi.getPending(),
  });
  const listItem: EvaluationListOut | undefined = pendingList.find(
    (item) => item.id === evaluationId,
  );

  // Clear the polling flag once a fresh result arrives.
  useEffect(() => {
    if (
      reEvaluatingSince &&
      evaluation &&
      evaluation.evaluated_at !== reEvaluatingSince
    ) {
      setReEvaluatingSince(null);
      toast.success("Re-evaluation complete");
    }
  }, [evaluation, reEvaluatingSince]);

  const handleMutationError = (error: unknown, fallback: string) => {
    toast.error(getErrorMessage(error, fallback));
    // On a concurrent-update conflict, refresh so the professor sees the
    // current approval state instead of a stale "pending" view.
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 409) {
      queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] });
    }
  };

  const approveMutation = useMutation({
    mutationFn: (feedback?: string) => evaluationsApi.approve(evaluationId!, feedback),
    onSuccess: () => {
      toast.success("Grade approved");
      queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] });
      queryClient.invalidateQueries({ queryKey: ["evaluations"] });
      setConfirmAction(null);
      navigate(-1);
    },
    onError: (error: unknown) => {
      setConfirmAction(null);
      handleMutationError(error, "Failed to approve grade");
    },
  });

  const overrideMutation = useMutation({
    mutationFn: (data: OverrideFormData) =>
      evaluationsApi.override(evaluationId!, {
        final_score: data.final_score,
        professor_feedback: data.professor_feedback,
      }),
    onSuccess: () => {
      toast.success("Grade overridden");
      queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] });
      queryClient.invalidateQueries({ queryKey: ["evaluations"] });
      setConfirmAction(null);
      navigate(-1);
    },
    onError: (error: unknown) => {
      setConfirmAction(null);
      handleMutationError(error, "Failed to override grade");
    },
  });

  const reEvaluateMutation = useMutation({
    mutationFn: () => evaluationsApi.trigger(evaluation!.submission_id),
    onSuccess: () => {
      toast.success("Re-evaluation started");
      setReEvaluatingSince(evaluation?.evaluated_at ?? null);
    },
    onError: (error: unknown) =>
      handleMutationError(error, "Failed to start re-evaluation"),
  });

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<OverrideFormData>({
    resolver: zodResolver(overrideSchema),
  });

  const breadcrumbs = [
    { label: "Grading Queue", to: "/professor/evaluations" },
    { label: listItem?.student_name ?? "Review" },
  ];

  if (isLoading) {
    return (
      <AppShell breadcrumbs={breadcrumbs}>
        <div className="space-y-6">
          <Skeleton className="h-9 w-1/3" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full lg:col-span-2" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (isError || !evaluation) {
    return (
      <AppShell breadcrumbs={breadcrumbs}>
        <ErrorState
          title="Evaluation not found"
          description="This evaluation may have been removed, or you don't have access to it."
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  const feedback = evaluation.ai_feedback;
  const isDecided = evaluation.approval_status !== "pending";
  const isFallback = feedback?.is_fallback === true;
  const criteria = feedback?.criteria_scores ?? [];

  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <div className="space-y-6">
        <PageHeader
          title={isDecided ? "Graded submission" : "Review AI evaluation"}
          description={
            listItem
              ? `${listItem.student_name} · ${listItem.assignment_title}`
              : "Check the AI's rubric-by-rubric reasoning, then approve or override."
          }
          actions={
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
              Back to queue
            </Button>
          }
        />

        {/* Re-evaluation in progress */}
        {reEvaluatingSince && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border border-processing/30 bg-processing-subtle px-4 py-3"
          >
            <RefreshCw
              className="h-5 w-5 flex-shrink-0 text-processing motion-safe:animate-spin"
              aria-hidden="true"
            />
            <p className="text-sm text-content-soft">
              GradeAI is re-grading this submission. The results will refresh
              automatically.
            </p>
          </div>
        )}

        {/* Needs-manual-review warning */}
        {isFallback && !isDecided && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3"
          >
            <AlertTriangle
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium text-content">Needs manual review</p>
              <p className="mt-0.5 text-sm text-content-soft">
                Automated grading didn't complete, so this is a placeholder score. Read
                the submission and override the grade before approving.
              </p>
            </div>
          </div>
        )}

        {/* Three-pane workspace */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* LEFT — the work being graded */}
          <div className="space-y-6">
            <SubmissionViewer
              studentName={listItem?.student_name}
              studentEmail={listItem?.student_email}
              unavailableNote="The submitted document isn't available from this endpoint yet."
            />
            {listItem && (
              <Card>
                <CardHeader>
                  <CardTitle>Assignment</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium text-content">
                    {listItem.assignment_title}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* CENTER — rubric evaluation */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Rubric evaluation</CardTitle>
                  <p className="mt-0.5 text-sm text-content-muted">
                    Every score traces back to one of your rubric criteria.
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {criteria.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="No criterion breakdown"
                    description="This evaluation didn't return per-criterion scores."
                  />
                ) : (
                  <div className="space-y-3">
                    {criteria.map((criterion, index) => (
                      <RubricCriterionRow
                        key={`${criterion.criterion_name}-${index}`}
                        criterionName={criterion.criterion_name}
                        awarded={criterion.awarded}
                        max={criterion.max}
                        reasoning={criterion.reasoning}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <AIReasoningPanel
              strengths={evaluation.strengths}
              weaknesses={evaluation.weaknesses}
              missingTopics={evaluation.missing_topics}
            />
          </div>

          {/* RIGHT — the decision */}
          <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <DecisionPanel
              evaluation={evaluation}
              isDecided={isDecided}
              isOverriding={isOverriding}
              onStartOverride={() => setIsOverriding(true)}
              onCancelOverride={() => setIsOverriding(false)}
              onApprove={() => setConfirmAction("approve")}
              onRequestOverride={handleSubmit(() => setConfirmAction("override"))}
              onReEvaluate={() => reEvaluateMutation.mutate()}
              isReEvaluating={
                reEvaluateMutation.isPending || reEvaluatingSince !== null
              }
              register={register}
              errors={errors}
            />
          </div>
        </div>
      </div>

      {/* Approve confirmation — finalising a grade is consequential */}
      <ConfirmDialog
        open={confirmAction === "approve"}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title="Approve the AI's grade?"
        description={
          <>
            The AI score of{" "}
            <strong className="font-semibold text-content">
              {evaluation.ai_score ?? "—"}
            </strong>{" "}
            becomes this student's final grade and their feedback is released.
          </>
        }
        confirmLabel="Approve grade"
        isLoading={approveMutation.isPending}
        onConfirm={() => approveMutation.mutate(undefined)}
      />

      {/* Override confirmation */}
      <ConfirmDialog
        open={confirmAction === "override"}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title="Override with your own grade?"
        description={
          <>
            Your score of{" "}
            <strong className="font-semibold text-content">
              {getValues("final_score") || "—"}
            </strong>{" "}
            replaces the AI's recommendation and becomes the final grade.
          </>
        }
        confirmLabel="Save override"
        isLoading={overrideMutation.isPending}
        onConfirm={() => overrideMutation.mutate(getValues())}
      />
    </AppShell>
  );
}

interface DecisionPanelProps {
  evaluation: EvaluationOut;
  isDecided: boolean;
  isOverriding: boolean;
  onStartOverride: () => void;
  onCancelOverride: () => void;
  onApprove: () => void;
  onRequestOverride: () => void;
  onReEvaluate: () => void;
  isReEvaluating: boolean;
  register: ReturnType<typeof useForm<OverrideFormData>>["register"];
  errors: ReturnType<typeof useForm<OverrideFormData>>["formState"]["errors"];
}

/**
 * The professor's side of the workspace. Keeps the AI's *recommendation* and the
 * professor's *final decision* visually distinct — the single most important
 * distinction in the product.
 */
function DecisionPanel({
  evaluation,
  isDecided,
  isOverriding,
  onStartOverride,
  onCancelOverride,
  onApprove,
  onRequestOverride,
  onReEvaluate,
  isReEvaluating,
  register,
  errors,
}: DecisionPanelProps) {
  const feedback = evaluation.ai_feedback;

  return (
    <>
      {/* AI recommendation */}
      <GradeDisplay
        label="AI recommendation"
        score={evaluation.ai_score}
        percentage={feedback?.percentage}
        tone="draft"
        caption={
          feedback ? (
            <ConfidenceMeter score={feedback.confidence_score} variant="bar" />
          ) : undefined
        }
      />

      {isDecided ? (
        /* Final decision */
        <Card>
          <CardHeader>
            <div className="flex w-full items-center justify-between gap-3">
              <CardTitle>Your decision</CardTitle>
              <StatusBadge kind="approval" value={evaluation.approval_status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <GradeDisplay
              label="Final grade"
              score={evaluation.final_score ?? evaluation.ai_score}
              percentage={feedback?.percentage}
              tone="final"
            />
            <p className="text-sm text-content-muted">
              {evaluation.approval_status === "approved"
                ? "You accepted the AI's recommendation"
                : "You replaced the AI's recommendation"}
              {evaluation.approved_at
                ? ` on ${formatDateTime(evaluation.approved_at)}.`
                : "."}
            </p>
            {evaluation.professor_feedback && (
              <div className="rounded-md border border-edge bg-surface-raised p-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-content-muted">
                  Your feedback
                </p>
                <p className="whitespace-pre-wrap text-sm text-content-soft">
                  {evaluation.professor_feedback}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Pending decision — actions */
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Your decision</CardTitle>
              <p className="mt-0.5 text-sm text-content-muted">
                Nothing reaches the student until you decide.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isOverriding ? (
              <>
                <Button block onClick={onApprove}>
                  <ShieldCheck className="h-4 w-4" />
                  Approve AI grade
                </Button>
                <Button variant="outline" block onClick={onStartOverride}>
                  <PencilRuler className="h-4 w-4" />
                  Override grade
                </Button>
                <div className="border-t border-edge-subtle pt-4">
                  <Button
                    variant="ghost"
                    block
                    onClick={onReEvaluate}
                    isLoading={isReEvaluating}
                  >
                    {!isReEvaluating && <RefreshCw className="h-4 w-4" />}
                    Re-run AI grading
                  </Button>
                  <p className="mt-1.5 text-center text-xs text-content-muted">
                    Ask the AI to grade this submission again
                  </p>
                </div>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onRequestOverride();
                }}
                className="space-y-4"
                noValidate
              >
                <Field
                  label="Final score"
                  htmlFor="final_score"
                  required
                  error={errors.final_score?.message}
                >
                  <Input
                    {...register("final_score")}
                    id="final_score"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="85"
                    invalid={!!errors.final_score}
                    aria-describedby={
                      errors.final_score ? "final_score-error" : undefined
                    }
                  />
                </Field>

                <Field
                  label="Feedback for the student"
                  htmlFor="professor_feedback"
                  required
                  error={errors.professor_feedback?.message}
                  hint="Explain what you changed and why."
                >
                  <Textarea
                    {...register("professor_feedback")}
                    id="professor_feedback"
                    rows={6}
                    placeholder="Explain why you're adjusting the AI's score…"
                    invalid={!!errors.professor_feedback}
                    aria-describedby={
                      errors.professor_feedback
                        ? "professor_feedback-error"
                        : "professor_feedback-hint"
                    }
                  />
                </Field>

                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">
                    <Save className="h-4 w-4" />
                    Save override
                  </Button>
                  <Button type="button" variant="ghost" onClick={onCancelOverride}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Provenance */}
      <div className="flex items-center gap-2 px-1 text-xs text-content-muted">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Drafted by AI on {formatDateTime(evaluation.evaluated_at)}</span>
        {feedback?.is_fallback && <Badge tone="warning">Placeholder</Badge>}
      </div>
    </>
  );
}
