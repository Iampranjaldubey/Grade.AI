import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, BookOpen, Users, FileText } from "lucide-react";
import * as api from "@/lib/api";
import { AppShell } from "@/components/layout";
import { CreateCourseModal } from "@/components/CreateCourseModal";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Skeleton,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";

export function CourseListPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [query, setQuery] = useState("");

  const {
    data: courses = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["courses"],
    queryFn: () => api.listCourses(),
  });

  const filtered = query.trim()
    ? courses.filter((c) =>
        `${c.course_name} ${c.course_code} ${c.semester}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : courses;

  return (
    <AppShell breadcrumbs={[{ label: "Courses" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Courses"
          description="Manage your courses, assignments, and enrolled students."
          actions={
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4" />
              New course
            </Button>
          }
        />

        {courses.length > 6 && (
          <div className="max-w-xs">
            <label htmlFor="course-search" className="sr-only">
              Search courses
            </label>
            <Input
              id="course-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search courses…"
            />
          </div>
        )}

        {isError ? (
          <ErrorState
            title="Couldn't load your courses"
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
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
            description="Create your first course to start building assignments and grading with AI."
            action={
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="h-4 w-4" />
                Create course
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No matching courses"
            description="Try a different course name, code, or semester."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((course) => (
              <Card key={course.id} interactive className="group">
                <Link
                  to={`/professor/courses/${course.id}`}
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

                  <div className="mt-4 flex items-center gap-4 border-t border-edge-subtle pt-4 text-sm text-content-muted">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" aria-hidden="true" />
                      {course.student_count}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <FileText className="h-4 w-4" aria-hidden="true" />
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
      </div>

      <CreateCourseModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </AppShell>
  );
}
