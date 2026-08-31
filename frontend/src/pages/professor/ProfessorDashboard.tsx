import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  BookOpen,
  FileText,
  Users,
  Plus,
  Award,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import * as api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { AppShell } from "@/components/layout";
import { CreateCourseModal } from "@/components/CreateCourseModal";
import {
  Button,
  buttonClasses,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { StatCard } from "@/components/domain";
import { formatDate } from "@/lib/utils";

export function ProfessorDashboard() {
  const { user } = useAuthStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => api.listCourses({ page: 1, size: 3 }),
  });

  const { data: analytics } = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => api.getAnalyticsOverview(),
  });

  const pending = analytics?.pending_evaluations ?? 0;
  const graded = analytics?.submissions_graded ?? 0;
  const totalSubs = analytics?.total_submissions ?? 0;

  return (
    <AppShell breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="space-y-8">
        <PageHeader
          title={`Welcome back, ${user?.name?.split(" ")[0] || "Professor"}`}
          description="Here's what needs your attention across your courses today."
          actions={
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4" />
              New course
            </Button>
          }
        />

        {/* Grading workload — the professor's most important recurring task */}
        {pending > 0 && (
          <Card className="border-brand/30 bg-brand-subtle/50">
            <div className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-brand text-white">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-serif text-lg font-semibold text-content">
                    {pending} {pending === 1 ? "evaluation" : "evaluations"} awaiting your
                    review
                  </p>
                  <p className="mt-0.5 text-sm text-content-soft">
                    AI has drafted grades and feedback. Approve or override each before
                    students see them.
                  </p>
                </div>
              </div>
              <Link
                to="/professor/evaluations"
                className={buttonClasses({ className: "flex-shrink-0" })}
              >
                Review now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Card>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={BookOpen}
            label="Courses"
            value={analytics?.total_courses ?? 0}
          />
          <StatCard
            icon={Users}
            label="Students"
            value={analytics?.total_students ?? 0}
          />
          <StatCard
            icon={FileText}
            label="Assignments"
            value={analytics?.total_assignments ?? 0}
          />
          <StatCard
            icon={Award}
            label="Average score"
            value={`${(analytics?.average_score ?? 0).toFixed(1)}%`}
            hint={totalSubs > 0 ? `${graded} of ${totalSubs} submissions graded` : undefined}
            tone="success"
          />
        </div>

        {/* Recent courses */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-xl font-semibold text-content">
              Recent courses
            </h2>
            {courses.length > 0 && (
              <Link
                to="/professor/courses"
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
              description="Create your first course to start building assignments and grading with AI."
              action={
                <Button onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Create course
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {courses.map((course) => (
                <Card key={course.id} interactive className="group">
                  <Link to={`/professor/courses/${course.id}`} className="block p-6">
                    <h3 className="font-serif text-lg font-semibold text-content group-hover:text-brand-fg motion-safe:transition-colors">
                      {course.course_name}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-content-muted">
                      {course.course_code} · {course.semester}
                    </p>
                    <div className="mt-4 flex items-center gap-4 border-t border-edge-subtle pt-4 text-sm text-content-muted">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4" />
                        {course.student_count}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-4 w-4" />
                        {course.assignment_count}
                      </span>
                      <span className="ml-auto text-xs">
                        {formatDate(course.created_at)}
                      </span>
                    </div>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      <CreateCourseModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </AppShell>
  );
}
