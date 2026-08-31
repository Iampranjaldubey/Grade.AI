import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BookOpen,
  FileText,
  Plus,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  ClipboardList,
} from "lucide-react";
import * as api from "@/lib/api";
import { submissionsApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { AppShell } from "@/components/layout";
import { JoinCourseModal } from "@/components/JoinCourseModal";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { StatCard } from "@/components/domain";
import { formatDate } from "@/lib/utils";
import type { AssignmentListOut, SubmissionOut } from "@/types";

interface CourseAssignment {
  assignment: AssignmentListOut;
  courseName: string;
  courseCode: string;
}

export function StudentDashboard() {
  const { user } = useAuthStore();
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["my-courses"],
    queryFn: () => api.getMyCourses(),
  });

  // Aggregate assignments across every enrolled course (requests run in parallel).
  const courseIds = courses.map((c) => c.id);
  const { data: assignments = [] } = useQuery({
    queryKey: ["student-assignments", courseIds],
    queryFn: async (): Promise<CourseAssignment[]> => {
      const perCourse = await Promise.all(
        courses.map(async (course) => {
          const list = await api.listAssignments({ course_id: course.id });
          return list.map((assignment) => ({
            assignment,
            courseName: course.course_name,
            courseCode: course.course_code,
          }));
        }),
      );
      return perCourse.flat();
    },
    enabled: courses.length > 0,
  });

  // Look up this student's submission for each assignment (null when none).
  // No batch endpoint exists, so these run concurrently and are cached.
  const assignmentIds = assignments.map((a) => a.assignment.id);
  const { data: submissionMap = {} } = useQuery({
    queryKey: ["student-submissions", assignmentIds],
    queryFn: async (): Promise<Record<string, SubmissionOut | null>> => {
      const entries = await Promise.all(
        assignments.map(async ({ assignment }) => {
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

  const now = Date.now();
  const activeAssignments = assignments.filter((a) => a.assignment.is_active);
  const submittedCount = activeAssignments.filter(
    (a) => !!submissionMap[a.assignment.id],
  ).length;
  const gradedCount = activeAssignments.filter(
    (a) => submissionMap[a.assignment.id]?.status === "evaluated",
  ).length;
  const pendingSubmissions = activeAssignments.filter(
    (a) => !submissionMap[a.assignment.id],
  ).length;

  const upcomingAssignments = activeAssignments
    .filter((a) => new Date(a.assignment.due_date).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.assignment.due_date).getTime() -
        new Date(b.assignment.due_date).getTime(),
    )
    .slice(0, 5);

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="space-y-8">
        <PageHeader
          title={`Welcome back, ${user?.name?.split(" ")[0] || "Student"}`}
          description="Here's an overview of your coursework and upcoming deadlines."
          actions={
            <Button onClick={() => setIsJoinModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Join a course
            </Button>
          }
        />

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={BookOpen} label="Enrolled courses" value={courses.length} />
          <StatCard
            icon={ClipboardList}
            label="To submit"
            value={pendingSubmissions}
            tone={pendingSubmissions > 0 ? "warning" : "neutral"}
          />
          <StatCard icon={CheckCircle2} label="Submitted" value={submittedCount} />
          <StatCard icon={GraduationCap} label="Graded" value={gradedCount} tone="success" />
        </div>

        {/* My Courses */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-xl font-semibold text-content">My courses</h2>
            {courses.length > 3 && (
              <Link
                to="/student/courses"
                className="text-sm font-medium text-brand-fg hover:underline"
              >
                View all
              </Link>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-6">
                  <Skeleton className="mb-3 h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </Card>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No courses yet"
              description="Join a course with the code your professor shared to see assignments and grades."
              action={
                <Button onClick={() => setIsJoinModalOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Join a course
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {courses.slice(0, 3).map((course) => (
                <Card key={course.id} interactive className="group">
                  <Link to={`/student/courses/${course.id}`} className="block p-6">
                    <h3 className="font-serif text-lg font-semibold text-content group-hover:text-brand-fg motion-safe:transition-colors">
                      {course.course_name}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-content-muted">
                      {course.course_code} · {course.semester}
                    </p>
                    {course.description && (
                      <p className="mt-3 line-clamp-2 text-sm text-content-soft">
                        {course.description}
                      </p>
                    )}
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Upcoming assignments */}
        <section>
          <h2 className="mb-4 font-serif text-xl font-semibold text-content">
            Upcoming assignments
          </h2>
          {upcomingAssignments.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="You're all caught up"
              description="New assignments will appear here as your professors post them."
            />
          ) : (
            <Card>
              <CardHeader className="sr-only">
                <CardTitle>Upcoming assignments</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-edge-subtle">
                {upcomingAssignments.map(({ assignment, courseCode }) => {
                  const submitted = !!submissionMap[assignment.id];
                  return (
                    <li key={assignment.id}>
                      <Link
                        to={`/student/assignments/${assignment.id}`}
                        className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-surface-raised motion-safe:transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-content">
                            {assignment.title}
                          </p>
                          <div className="mt-1 flex items-center gap-3 text-sm text-content-muted">
                            <span>{courseCode}</span>
                            <span className="flex items-center gap-1">
                              <CalendarClock className="h-4 w-4" />
                              Due {formatDate(assignment.due_date)}
                            </span>
                          </div>
                        </div>
                        {submitted ? (
                          <Badge tone="success">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Submitted
                          </Badge>
                        ) : (
                          <Badge tone="warning">
                            <FileText className="h-3.5 w-3.5" />
                            Not submitted
                          </Badge>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </section>
      </div>

      <JoinCourseModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} />
    </AppShell>
  );
}
