import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, FileText, Award, ChevronRight } from "lucide-react";
import * as api from "@/lib/api";
import { submissionsApi } from "@/lib/api";
import { AppShell } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { StudentAssignmentStatus } from "@/components/domain";
import { formatDateTime, isPastDue, cn } from "@/lib/utils";
import type { SubmissionOut } from "@/types";

export function StudentCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();

  const {
    data: course,
    isLoading: courseLoading,
    isError: courseError,
    refetch: refetchCourse,
  } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => api.getCourse(courseId!),
    enabled: !!courseId,
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["assignments", courseId],
    queryFn: () => api.listAssignments({ course_id: courseId! }),
    enabled: !!courseId,
  });

  // One lookup per assignment (no batch endpoint exists); runs in parallel.
  const assignmentIds = assignments.map((a) => a.id);
  const { data: submissionsMap = {} } = useQuery({
    queryKey: ["allSubmissions", courseId, assignmentIds],
    queryFn: async (): Promise<Record<string, SubmissionOut | null>> => {
      const entries = await Promise.all(
        assignments.map(async (assignment) => {
          try {
            const submission = await submissionsApi.getMySubmission(assignment.id);
            return [assignment.id, submission] as const;
          } catch {
            return [assignment.id, null] as const;
          }
        }),
      );
      return Object.fromEntries(entries);
    },
    enabled: assignments.length > 0,
  });

  const breadcrumbs = [
    { label: "My Courses", to: "/student/courses" },
    { label: course?.course_code ?? "Course" },
  ];

  if (courseLoading) {
    return (
      <AppShell breadcrumbs={breadcrumbs}>
        <div className="space-y-6">
          <Skeleton className="h-9 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  if (courseError || !course) {
    return (
      <AppShell breadcrumbs={breadcrumbs}>
        <ErrorState
          title="Course not found"
          description="This course may no longer be available, or you're not enrolled in it."
          onRetry={() => refetchCourse()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <div className="space-y-6">
        <PageHeader
          title={course.course_name}
          description={`${course.course_code} · ${course.semester}`}
        />

        {course.description && (
          <Card>
            <CardContent>
              <p className="text-content-soft">{course.description}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Assignments</CardTitle>
          </CardHeader>

          {assignmentsLoading ? (
            <CardContent className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          ) : assignments.length === 0 ? (
            <CardContent>
              <EmptyState
                icon={FileText}
                title="No assignments yet"
                description="Your professor hasn't posted any assignments for this course."
              />
            </CardContent>
          ) : (
            <ul className="divide-y divide-edge-subtle">
              {assignments.map((assignment) => {
                const overdue = isPastDue(assignment.due_date);
                return (
                  <li key={assignment.id}>
                    <Link
                      to={`/student/assignments/${assignment.id}`}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-surface-raised motion-safe:transition-colors sm:px-6"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <h3 className="font-medium text-content">
                            {assignment.title}
                          </h3>
                          <StudentAssignmentStatus
                            submission={submissionsMap[assignment.id]}
                            dueDate={assignment.due_date}
                          />
                        </div>

                        {assignment.description && (
                          <p className="mt-1.5 line-clamp-2 text-sm text-content-soft">
                            {assignment.description}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-content-muted">
                          <span className="flex items-center gap-1.5">
                            <CalendarClock className="h-4 w-4" aria-hidden="true" />
                            <span
                              className={cn(overdue && "font-medium text-danger-fg")}
                            >
                              Due {formatDateTime(assignment.due_date)}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Award className="h-4 w-4" aria-hidden="true" />
                            {assignment.max_score} points
                          </span>
                        </div>
                      </div>

                      <ChevronRight
                        className="h-5 w-5 flex-shrink-0 text-content-muted"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
