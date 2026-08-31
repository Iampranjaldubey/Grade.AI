import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Plus, CalendarDays } from "lucide-react";
import * as api from "@/lib/api";
import { AppShell } from "@/components/layout";
import { JoinCourseModal } from "@/components/JoinCourseModal";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
} from "@/components/ui";

export function StudentCoursesPage() {
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  const {
    data: courses = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["my-courses"],
    queryFn: () => api.getMyCourses(),
  });

  return (
    <AppShell breadcrumbs={[{ label: "My Courses" }]}>
      <div className="space-y-6">
        <PageHeader
          title="My courses"
          description="Every course you're enrolled in, with its assignments and grades."
          actions={
            <Button onClick={() => setIsJoinModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Join course
            </Button>
          }
        />

        {isError ? (
          <ErrorState title="Couldn't load your courses" onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6">
                <Skeleton className="mb-3 h-5 w-3/4" />
                <Skeleton className="mb-6 h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
              </Card>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No courses yet"
            description="Join a course using the code your professor shared with you."
            action={
              <Button onClick={() => setIsJoinModalOpen(true)}>
                <Plus className="h-4 w-4" />
                Join a course
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <Card key={course.id} interactive className="group">
                <Link
                  to={`/student/courses/${course.id}`}
                  className="block p-6 focus-visible:outline-none"
                >
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

                  <div className="mt-4 flex items-center gap-1.5 border-t border-edge-subtle pt-4 text-xs text-content-muted">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {course.semester}
                  </div>
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>

      <JoinCourseModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
      />
    </AppShell>
  );
}
