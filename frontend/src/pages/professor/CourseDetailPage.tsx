import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Users,
  FileText,
  Copy,
  Check,
  Plus,
  CalendarClock,
  Award,
  FolderOpen,
  Info,
} from "lucide-react";
import toast from "react-hot-toast";
import * as api from "@/lib/api";
import { uploadsApi } from "@/lib/api";
import { AppShell } from "@/components/layout";
import { CreateAssignmentModal } from "@/components/CreateAssignmentModal";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type Column,
} from "@/components/ui";
import { DocumentSection, StatCard, pollWhileParsing } from "@/components/domain";
import { formatDate, formatDateTime, isPastDue } from "@/lib/utils";
import type { AssignmentListOut, CourseListOut } from "@/types";

type CourseStudent = {
  id: string;
  name: string;
  email: string;
  enrolled_at: string;
  submission_count: number;
};

export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

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

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["course-students", courseId],
    queryFn: () => api.getCourseStudents(courseId!),
    enabled: !!courseId,
  });

  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ["course-documents", courseId],
    queryFn: () => uploadsApi.getCourseDocuments(courseId!),
    enabled: !!courseId,
    refetchInterval: (query) => pollWhileParsing(query.state.data),
  });

  const breadcrumbs = [
    { label: "Courses", to: "/professor/courses" },
    { label: course?.course_code ?? "Course" },
  ];

  if (courseLoading) {
    return (
      <AppShell breadcrumbs={breadcrumbs}>
        <div className="space-y-6">
          <Skeleton className="h-9 w-1/3" />
          <Skeleton className="h-10 w-full max-w-md" />
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
          description="This course may have been removed, or you don't have access to it."
          onRetry={() => refetchCourse()}
        />
      </AppShell>
    );
  }

  const notesDocuments = documents.filter((doc) => doc.doc_type === "notes");

  return (
    <AppShell breadcrumbs={breadcrumbs}>
      <div className="space-y-6">
        <PageHeader
          title={course.course_name}
          description={`${course.course_code} · ${course.semester}`}
          actions={
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4" />
              New assignment
            </Button>
          }
        />

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="assignments">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Assignments
              <Badge tone="neutral">{course.assignment_count}</Badge>
            </TabsTrigger>
            <TabsTrigger value="students">
              <Users className="h-4 w-4" aria-hidden="true" />
              Students
              <Badge tone="neutral">{course.student_count}</Badge>
            </TabsTrigger>
            <TabsTrigger value="materials">
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              Materials
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab course={course} />
          </TabsContent>

          <TabsContent value="assignments">
            <AssignmentsTab
              assignments={assignments}
              isLoading={assignmentsLoading}
              onCreateNew={() => setIsCreateModalOpen(true)}
              onOpen={(assignmentId) =>
                navigate(`/professor/courses/${courseId}/assignments/${assignmentId}`)
              }
            />
          </TabsContent>

          <TabsContent value="students">
            <StudentsTab students={students} isLoading={studentsLoading} />
          </TabsContent>

          <TabsContent value="materials">
            <div className="space-y-6">
              <DocumentSection
                title="Lecture notes"
                description="Course material the AI can reference as grading context."
                docType="notes"
                documents={notesDocuments}
                courseId={courseId!}
                isLoading={documentsLoading}
                onChanged={() =>
                  queryClient.invalidateQueries({
                    queryKey: ["course-documents", courseId],
                  })
                }
              />
              <div
                className="flex items-start gap-3 rounded-lg border border-info-subtle bg-info-subtle/60 px-4 py-3"
                role="note"
              >
                <Info
                  className="mt-0.5 h-5 w-5 flex-shrink-0 text-info"
                  aria-hidden="true"
                />
                <p className="text-sm text-content-soft">
                  Rubric documents and sample solutions are managed per assignment. Open an
                  assignment to upload material specific to it.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <CreateAssignmentModal
        courseId={courseId!}
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </AppShell>
  );
}

function OverviewTab({ course }: { course: CourseListOut }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(course.join_code || "");
    setCopied(true);
    toast.success("Join code copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Course details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              <Detail label="Course name" value={course.course_name} />
              <Detail label="Course code" value={course.course_code} />
              <Detail label="Semester" value={course.semester} />
              <Detail label="Created" value={formatDate(course.created_at)} />
              {course.description && (
                <div className="sm:col-span-2">
                  <Detail label="Description" value={course.description} />
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <StatCard icon={Users} label="Students enrolled" value={course.student_count} />
          <StatCard icon={FileText} label="Assignments" value={course.assignment_count} />
        </div>
      </div>

      {/* Invite card */}
      <Card className="h-fit">
        <CardHeader>
          <div>
            <CardTitle>Invite students</CardTitle>
            <p className="mt-0.5 text-sm text-content-muted">
              Share this code so students can enroll themselves.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-dashed border-edge-strong bg-surface-raised px-4 py-5 text-center">
            <p className="font-serif text-3xl font-semibold tracking-[0.2em] text-content">
              {course.join_code || "N/A"}
            </p>
          </div>
          <Button variant="outline" block onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy join code
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[13px] font-medium text-content-muted">{label}</dt>
      <dd className="mt-1 text-content">{value}</dd>
    </div>
  );
}

function AssignmentsTab({
  assignments,
  isLoading,
  onCreateNew,
  onOpen,
}: {
  assignments: AssignmentListOut[];
  isLoading: boolean;
  onCreateNew: () => void;
  onOpen: (assignmentId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-6">
            <Skeleton className="mb-3 h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </Card>
        ))}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No assignments yet"
        description="Create an assignment, add a rubric, and GradeAI can start drafting grades."
        action={
          <Button onClick={onCreateNew}>
            <Plus className="h-4 w-4" />
            Create assignment
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {assignments.map((assignment) => {
        const overdue = isPastDue(assignment.due_date);
        return (
          <Card key={assignment.id} interactive className="group">
            <button
              type="button"
              onClick={() => onOpen(assignment.id)}
              className="w-full p-6 text-left focus-visible:outline-none"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="font-serif text-lg font-semibold text-content group-hover:text-brand-fg motion-safe:transition-colors">
                  {assignment.title}
                </h3>
                <StatusBadge kind="gradingMode" value={assignment.grading_mode} />
              </div>
              {assignment.description && (
                <p className="mb-4 line-clamp-2 text-sm text-content-soft">
                  {assignment.description}
                </p>
              )}
              <dl className="space-y-1.5 text-sm text-content-muted">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" aria-hidden="true" />
                  <span className={overdue ? "font-medium text-danger-fg" : undefined}>
                    Due {formatDateTime(assignment.due_date)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4" aria-hidden="true" />
                  {assignment.max_score} points
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {assignment.submission_count}{" "}
                  {assignment.submission_count === 1 ? "submission" : "submissions"}
                </div>
              </dl>
            </button>
          </Card>
        );
      })}
    </div>
  );
}

function StudentsTab({
  students,
  isLoading,
}: {
  students: CourseStudent[];
  isLoading: boolean;
}) {
  const columns: Column<CourseStudent>[] = [
    {
      id: "name",
      header: "Student",
      sortValue: (s) => s.name,
      cell: (s) => <span className="font-medium text-content">{s.name}</span>,
    },
    {
      id: "email",
      header: "Email",
      sortValue: (s) => s.email,
      cell: (s) => <span className="text-content-muted">{s.email}</span>,
    },
    {
      id: "enrolled",
      header: "Enrolled",
      sortValue: (s) => new Date(s.enrolled_at).getTime(),
      cell: (s) => (
        <span className="whitespace-nowrap text-content-muted">
          {formatDate(s.enrolled_at)}
        </span>
      ),
    },
    {
      id: "submissions",
      header: "Submissions",
      align: "right",
      sortValue: (s) => s.submission_count,
      cell: (s) => <span className="tabular-nums">{s.submission_count}</span>,
    },
  ];

  return (
    <DataTable
      data={students}
      columns={columns}
      getRowId={(s) => s.id}
      isLoading={isLoading}
      searchable={(s) => `${s.name} ${s.email}`}
      searchPlaceholder="Search students…"
      caption="Students enrolled in this course"
      empty={
        <EmptyState
          icon={Users}
          title="No students enrolled"
          description="Share the join code from the Overview tab so students can enroll."
        />
      }
    />
  );
}
