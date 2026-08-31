import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  CalendarClock,
  ClipboardList,
  FileText,
  FolderOpen,
  Info,
} from "lucide-react";
import * as api from "@/lib/api";
import { submissionsApi, uploadsApi } from "@/lib/api";
import { AppShell } from "@/components/layout";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import {
  DocumentSection,
  RubricBuilder,
  SubmissionsTable,
  pollWhileEvaluating,
  pollWhileParsing,
} from "@/components/domain";
import { formatDateTime, isPastDue, cn } from "@/lib/utils";
import type { AssignmentOut, DocumentOut } from "@/types";

/**
 * Assignment workspace for professors: instructions, the grading rubric,
 * submissions, and reference material.
 *
 * Previously a ~980-line monolith that mixed all four concerns plus its own
 * document uploader, badges, and tables. Those are now shared components and
 * this file is only composition + data fetching.
 */
export function AssignmentDetailPage() {
  const { assignmentId, courseId } = useParams<{
    courseId: string;
    assignmentId: string;
  }>();
  const queryClient = useQueryClient();

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

  const { data: submissions = [], isLoading: submissionsLoading } = useQuery({
    queryKey: ["submissions", assignmentId],
    queryFn: () => submissionsApi.getAllSubmissions(assignmentId!),
    enabled: !!assignmentId,
    // Keep refreshing while the AI is still grading anything.
    refetchInterval: (query) => pollWhileEvaluating(query.state.data),
  });

  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ["assignment-documents", assignmentId],
    queryFn: async (): Promise<DocumentOut[]> => {
      const allDocs = await uploadsApi.getCourseDocuments(courseId!);
      return allDocs.filter((doc) => doc.assignment_id === assignmentId);
    },
    enabled: !!assignmentId && !!courseId,
    refetchInterval: (query) => pollWhileParsing(query.state.data),
  });

  const breadcrumbs = [
    { label: "Courses", to: "/professor/courses" },
    { label: "Course", to: `/professor/courses/${courseId}` },
    { label: assignment?.title ?? "Assignment" },
  ];

  if (assignmentLoading) {
    return (
      <AppShell breadcrumbs={breadcrumbs}>
        <div className="space-y-6">
          <Skeleton className="h-9 w-1/2" />
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  if (assignmentError || !assignment) {
    return (
      <AppShell breadcrumbs={breadcrumbs}>
        <ErrorState
          title="Assignment not found"
          description="This assignment may have been removed, or you don't have access to it."
          onRetry={() => refetchAssignment()}
        />
      </AppShell>
    );
  }

  const rubricDocuments = documents.filter((d) => d.doc_type === "rubric");
  const sampleDocuments = documents.filter((d) => d.doc_type === "sample_solution");
  const invalidateDocuments = () =>
    queryClient.invalidateQueries({
      queryKey: ["assignment-documents", assignmentId],
    });

  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <div className="space-y-6">
        <PageHeader
          title={assignment.title}
          description={`${assignment.max_score} points · due ${formatDateTime(
            assignment.due_date,
          )}`}
          actions={<StatusBadge kind="gradingMode" value={assignment.grading_mode} />}
        />

        <Tabs defaultValue="rubric">
          <TabsList>
            <TabsTrigger value="rubric">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Rubric
              <Badge tone="neutral">{rubrics.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="submissions">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Submissions
              <Badge tone="neutral">{submissions.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="instructions">
              <Info className="h-4 w-4" aria-hidden="true" />
              Instructions
            </TabsTrigger>
            <TabsTrigger value="materials">
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              Materials
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rubric">
            <RubricBuilder
              assignmentId={assignmentId!}
              rubrics={rubrics}
              isLoading={rubricsLoading}
            />
          </TabsContent>

          <TabsContent value="submissions">
            {rubrics.length === 0 ? (
              <div
                className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3"
                role="note"
              >
                <Info
                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning"
                  aria-hidden="true"
                />
                <p className="text-sm text-content-soft">
                  Add a rubric before grading — GradeAI needs criteria to score
                  against.
                </p>
              </div>
            ) : (
              <SubmissionsTable
                assignmentId={assignmentId!}
                submissions={submissions}
                isLoading={submissionsLoading}
              />
            )}
          </TabsContent>

          <TabsContent value="instructions">
            <InstructionsTab assignment={assignment} />
          </TabsContent>

          <TabsContent value="materials">
            <div className="space-y-6">
              <DocumentSection
                title="Rubric documents"
                description="An uploaded rubric the AI can reference while grading."
                docType="rubric"
                documents={rubricDocuments}
                courseId={assignment.course_id}
                assignmentId={assignmentId}
                isLoading={documentsLoading}
                onChanged={invalidateDocuments}
              />
              <DocumentSection
                title="Sample solutions"
                description="Model answers used as grading reference material."
                docType="sample_solution"
                documents={sampleDocuments}
                courseId={assignment.course_id}
                assignmentId={assignmentId}
                isLoading={documentsLoading}
                onChanged={invalidateDocuments}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function InstructionsTab({ assignment }: { assignment: AssignmentOut }) {
  const overdue = isPastDue(assignment.due_date);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          {assignment.description ? (
            <p className="whitespace-pre-wrap leading-relaxed text-content-soft">
              {assignment.description}
            </p>
          ) : (
            <p className="text-sm text-content-muted">
              No instructions were provided for this assignment.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <Detail
              icon={CalendarClock}
              label="Due date"
              value={formatDateTime(assignment.due_date)}
              valueClassName={cn(overdue && "text-danger-fg font-medium")}
            />
            <Detail
              icon={Award}
              label="Total points"
              value={`${assignment.max_score} points`}
            />
            <div>
              <dt className="mb-1.5 text-[13px] font-medium text-content-muted">
                Grading mode
              </dt>
              <dd>
                <StatusBadge kind="gradingMode" value={assignment.grading_mode} />
              </dd>
            </div>
            <div>
              <dt className="mb-1.5 text-[13px] font-medium text-content-muted">
                Status
              </dt>
              <dd>
                <Badge tone={overdue ? "danger" : "success"}>
                  {overdue ? "Closed" : "Open"}
                </Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: typeof Award;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <dt className="mb-1 flex items-center gap-1.5 text-[13px] font-medium text-content-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className={cn("text-content", valueClassName)}>{value}</dd>
    </div>
  );
}
