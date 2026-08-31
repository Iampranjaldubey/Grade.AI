import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import * as api from "@/lib/api";
import { submissionsApi, evaluationsApi, uploadsApi, getErrorMessage } from "@/lib/api";
import { AppShell } from "@/components/layout";
import { DocumentUploadZone } from "@/components/DocumentUploadZone";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import {
  AIReasoningPanel,
  GradeDisplay,
  RubricCriterionRow,
  SubmissionViewer,
  readEvaluationSummary,
} from "@/components/domain";
import { formatDateTime, isPastDue, cn } from "@/lib/utils";
import type { AssignmentOut, DocumentType, RubricOut } from "@/types";

export function AssignmentSubmissionPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const queryClient = useQueryClient();

  const [isResubmitting, setIsResubmitting] = useState(false);
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(null);
  const [uploadedFileSize, setUploadedFileSize] = useState<number>(0);

  const {
    data: assignment,
    isLoading: assignmentLoading,
    isError: assignmentError,
    refetch: refetchAssignment,
  } = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: () => api.getAssignment(assignmentId!),
    enabled: !!assignmentId,
  });

  const { data: rubrics = [], isLoading: rubricsLoading } = useQuery({
    queryKey: ["rubrics", assignmentId],
    queryFn: () => api.getRubrics(assignmentId!),
    enabled: !!assignmentId,
  });

  const { data: submission } = useQuery({
    queryKey: ["mySubmission", assignmentId],
    queryFn: () => submissionsApi.getMySubmission(assignmentId!),
    enabled: !!assignmentId,
    retry: false,
    // Keep checking while the AI is grading so the result appears on its own.
    refetchInterval: (query) =>
      query.state.data?.status === "evaluating" ? 5000 : false,
  });

  const { data: evaluation } = useQuery({
    queryKey: ["myEvaluation", submission?.id],
    queryFn: () => evaluationsApi.getMyGrade(submission!.id),
    enabled: !!submission && submission.status === "evaluated",
    retry: false,
  });

  const { data: uploadedDocument } = useQuery({
    queryKey: ["document", uploadedDocumentId],
    queryFn: () => uploadsApi.getStatus(uploadedDocumentId!),
    enabled: !!uploadedDocumentId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.parse_status === "processing" || data.parse_status === "pending"
        ? 2000
        : false;
    },
  });

  const submitMutation = useMutation({
    mutationFn: (data: {
      assignment_id: string;
      file_name: string;
      file_key: string;
      file_size_bytes: number;
    }) => submissionsApi.submit(data),
    onSuccess: () => {
      toast.success("Assignment submitted");
      queryClient.invalidateQueries({ queryKey: ["mySubmission", assignmentId] });
      setUploadedDocumentId(null);
      setUploadedFileKey(null);
      setUploadedFileSize(0);
      setIsResubmitting(false);
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Failed to submit assignment"));
    },
  });

  const handleUploadSuccess = (
    documentId: string,
    fileKey: string,
    fileSizeBytes: number,
  ) => {
    setUploadedDocumentId(documentId);
    setUploadedFileKey(fileKey);
    setUploadedFileSize(fileSizeBytes);
  };

  const handleSubmit = () => {
    if (!uploadedDocumentId || !uploadedDocument || !uploadedFileKey || !uploadedFileSize) {
      toast.error("Please upload a file first");
      return;
    }
    if (uploadedDocument.parse_status !== "success") {
      toast.error("Please wait for the file to finish processing");
      return;
    }
    submitMutation.mutate({
      assignment_id: assignmentId!,
      file_name: uploadedDocument.file_name,
      file_key: uploadedFileKey,
      file_size_bytes: uploadedFileSize,
    });
  };

  const cancelResubmit = () => {
    setIsResubmitting(false);
    setUploadedDocumentId(null);
    setUploadedFileKey(null);
    setUploadedFileSize(0);
  };

  const breadcrumbs = [
    { label: "My Courses", to: "/student/courses" },
    { label: assignment?.title ?? "Assignment" },
  ];

  if (assignmentLoading || rubricsLoading) {
    return (
      <AppShell breadcrumbs={breadcrumbs}>
        <div className="space-y-6">
          <Skeleton className="h-9 w-1/2" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (assignmentError || !assignment) {
    return (
      <AppShell breadcrumbs={breadcrumbs}>
        <ErrorState
          title="Assignment not found"
          description="This assignment may no longer be available."
          onRetry={() => refetchAssignment()}
        />
      </AppShell>
    );
  }

  const overdue = isPastDue(assignment.due_date);
  const hasSubmission = !!submission;
  const isGraded = submission?.status === "evaluated" && !!evaluation;
  const canSubmitUpload =
    !!uploadedDocumentId &&
    !!uploadedDocument &&
    uploadedDocument.parse_status === "success";

  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <div className="space-y-6">
        <PageHeader
          title={assignment.title}
          description={`${assignment.max_score} points · due ${formatDateTime(
            assignment.due_date,
          )}`}
          actions={
            <Badge tone={overdue ? "danger" : "success"}>
              {overdue ? "Closed" : "Open"}
            </Badge>
          }
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* LEFT — what's being asked */}
          <div className="space-y-6">
            <AssignmentBrief assignment={assignment} overdue={overdue} />
            <RubricPreview rubrics={rubrics} />
          </div>

          {/* RIGHT — the student's four-state flow */}
          <div className="space-y-6">
            {/* State 1: nothing submitted yet */}
            {!hasSubmission && !isResubmitting && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Submit your work</CardTitle>
                    <p className="mt-0.5 text-sm text-content-muted">
                      Upload your file, then submit it for grading.
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DocumentUploadZone
                    accept=".pdf,.doc,.docx,.txt"
                    docType={"submission" as DocumentType}
                    courseId={assignment.course_id}
                    assignmentId={assignmentId}
                    onSuccess={handleUploadSuccess}
                    onError={(error) => toast.error(error.message || "Upload failed")}
                  />
                  {uploadedDocumentId && (
                    <Button
                      block
                      onClick={handleSubmit}
                      disabled={!canSubmitUpload}
                      isLoading={submitMutation.isPending}
                    >
                      {!submitMutation.isPending && <Upload className="h-4 w-4" />}
                      Submit assignment
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* State 2: submitted, awaiting or undergoing grading */}
            {hasSubmission && !isGraded && !isResubmitting && (
              <>
                <SubmissionViewer
                  title="Your submission"
                  fileName={submission.file_name}
                  fileUrl={submission.file_url}
                  submittedAt={submission.submitted_at}
                  status={submission.status}
                />

                <Card>
                  <CardContent>
                    <div className="flex items-start gap-3">
                      {submission.status === "evaluating" ? (
                        <Loader2
                          className="mt-0.5 h-5 w-5 flex-shrink-0 text-processing motion-safe:animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <CheckCircle2
                          className="mt-0.5 h-5 w-5 flex-shrink-0 text-success"
                          aria-hidden="true"
                        />
                      )}
                      <div role="status">
                        <p className="font-medium text-content">
                          {submission.status === "evaluating"
                            ? "Being graded"
                            : "Submitted successfully"}
                        </p>
                        <p className="mt-0.5 text-sm text-content-soft">
                          {submission.status === "evaluating"
                            ? "Your grade will appear here automatically once your professor has reviewed it."
                            : "Your work is in. You'll see your grade once it's been graded and released."}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {!overdue && (
                  <Button
                    variant="outline"
                    block
                    onClick={() => setIsResubmitting(true)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Replace my submission
                  </Button>
                )}
              </>
            )}

            {/* State 3: replacing an existing submission */}
            {isResubmitting && (
              <Card>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>Replace your submission</CardTitle>
                    <p className="mt-0.5 text-sm text-content-muted">
                      Uploading a new file replaces the one you submitted.
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={cancelResubmit}>
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DocumentUploadZone
                    accept=".pdf,.doc,.docx,.txt"
                    docType={"submission" as DocumentType}
                    courseId={assignment.course_id}
                    assignmentId={assignmentId}
                    onSuccess={handleUploadSuccess}
                    onError={(error) => toast.error(error.message || "Upload failed")}
                  />
                  {uploadedDocumentId && (
                    <Button
                      block
                      onClick={handleSubmit}
                      disabled={!canSubmitUpload}
                      isLoading={submitMutation.isPending}
                    >
                      {!submitMutation.isPending && <Upload className="h-4 w-4" />}
                      Submit new version
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* State 4: graded */}
            {isGraded && evaluation && !isResubmitting && (
              <GradedResult
                evaluation={evaluation}
                maxScore={assignment.max_score}
                submissionFileName={submission.file_name}
                submissionFileUrl={submission.file_url}
                submittedAt={submission.submitted_at}
              />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function AssignmentBrief({
  assignment,
  overdue,
}: {
  assignment: AssignmentOut;
  overdue: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assignment details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {assignment.description && (
          <p className="whitespace-pre-wrap leading-relaxed text-content-soft">
            {assignment.description}
          </p>
        )}
        <dl className="space-y-3">
          <div className="flex items-center gap-2.5 text-sm">
            <CalendarClock
              className="h-4 w-4 flex-shrink-0 text-content-muted"
              aria-hidden="true"
            />
            <dt className="text-content-muted">Due</dt>
            <dd className={cn("font-medium", overdue ? "text-danger-fg" : "text-content")}>
              {formatDateTime(assignment.due_date)}
            </dd>
          </div>
          <div className="flex items-center gap-2.5 text-sm">
            <Award
              className="h-4 w-4 flex-shrink-0 text-content-muted"
              aria-hidden="true"
            />
            <dt className="text-content-muted">Worth</dt>
            <dd className="font-medium text-content">{assignment.max_score} points</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function RubricPreview({ rubrics }: { rubrics: RubricOut[] }) {
  if (rubrics.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>How you'll be graded</CardTitle>
          <p className="mt-0.5 text-sm text-content-muted">
            Your work is scored against these criteria.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {rubrics.map((rubric) => (
            <li
              key={rubric.id}
              className="rounded-md border border-edge bg-surface-raised p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-medium text-content">{rubric.criteria_name}</h4>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Badge tone="neutral">{rubric.max_points} pts</Badge>
                  <Badge tone="neutral">{rubric.weight}%</Badge>
                </div>
              </div>
              {rubric.description && (
                <p className="mt-1.5 text-sm text-content-soft">{rubric.description}</p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function GradedResult({
  evaluation,
  maxScore,
  submissionFileName,
  submissionFileUrl,
  submittedAt,
}: {
  evaluation: unknown;
  maxScore: string;
  submissionFileName: string;
  submissionFileUrl: string;
  submittedAt: string;
}) {
  const summary = readEvaluationSummary(evaluation);
  const record = evaluation as Record<string, unknown>;
  const score =
    (typeof record.final_score === "string" ? record.final_score : undefined) ??
    (typeof record.ai_score === "string" ? record.ai_score : undefined) ??
    null;
  const professorFeedback =
    typeof record.professor_feedback === "string" ? record.professor_feedback : undefined;
  const strengths = Array.isArray(record.strengths)
    ? (record.strengths as string[])
    : null;
  const weaknesses = Array.isArray(record.weaknesses)
    ? (record.weaknesses as string[])
    : null;
  const missingTopics = Array.isArray(record.missing_topics)
    ? (record.missing_topics as string[])
    : null;

  return (
    <div className="space-y-6">
      <GradeDisplay
        label="Your grade"
        score={score}
        outOf={maxScore}
        percentage={summary.percentage}
        tone="final"
        caption={
          <p className="flex items-center justify-center gap-1.5 text-sm text-content-soft">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            Reviewed and released by your professor
          </p>
        }
      />

      {summary.criteria.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Score breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.criteria.map((criterion, index) => (
                <RubricCriterionRow
                  key={`${criterion.criterion_name}-${index}`}
                  criterionName={criterion.criterion_name}
                  awarded={criterion.awarded}
                  max={criterion.max}
                  reasoning={criterion.reasoning}
                  reasoningLabel="Why you got this score"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {summary.criteria.length === 0 && (
        <Card>
          <CardContent>
            <div className="flex items-start gap-3">
              <ClipboardList
                className="mt-0.5 h-5 w-5 flex-shrink-0 text-content-muted"
                aria-hidden="true"
              />
              <p className="text-sm text-content-soft">
                A per-criterion breakdown isn't available for this grade.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <AIReasoningPanel
        title="Your feedback"
        strengths={strengths}
        weaknesses={weaknesses}
        missingTopics={missingTopics}
      />

      {(professorFeedback || summary.overallFeedback) && (
        <Card>
          <CardHeader>
            <CardTitle>Professor's comments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap leading-relaxed text-content-soft">
              {professorFeedback || summary.overallFeedback}
            </p>
          </CardContent>
        </Card>
      )}

      <SubmissionViewer
        title="What you submitted"
        fileName={submissionFileName}
        fileUrl={submissionFileUrl}
        submittedAt={submittedAt}
      />
    </div>
  );
}
