import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { 
  BookOpen, 
  Users, 
  FileText, 
  Copy, 
  Check, 
  Plus,
  Calendar,
  Award,
  Clock
} from "lucide-react";
import toast from "react-hot-toast";
import * as api from "@/lib/api";
import { ProfessorLayout } from "@/components/ProfessorLayout";
import { CreateAssignmentModal } from "@/components/CreateAssignmentModal";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import type { AssignmentListOut } from "@/types";

type Tab = "overview" | "assignments" | "students";

export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => api.getCourse(courseId!),
    enabled: !!courseId,
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["assignments", courseId],
    queryFn: () => api.listAssignments({ course_id: courseId! }),
    enabled: !!courseId && activeTab === "assignments",
  });

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["course-students", courseId],
    queryFn: () => api.getCourseStudents(courseId!),
    enabled: !!courseId && activeTab === "students",
  });

  const handleCopyJoinCode = async () => {
    if (!course) return;
    await navigator.clipboard.writeText(course.join_code || "");
    setCopiedCode(true);
    toast.success("Join code copied!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (courseLoading) {
    return (
      <ProfessorLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </ProfessorLayout>
    );
  }

  if (!course) {
    return (
      <ProfessorLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900">Course not found</h1>
        </div>
      </ProfessorLayout>
    );
  }

  return (
    <ProfessorLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{course.course_name}</h1>
          <p className="text-gray-600 mt-2">
            {course.course_code} • {course.semester}
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <TabButton
              active={activeTab === "overview"}
              onClick={() => setActiveTab("overview")}
              icon={<BookOpen className="w-5 h-5" />}
            >
              Overview
            </TabButton>
            <TabButton
              active={activeTab === "assignments"}
              onClick={() => setActiveTab("assignments")}
              icon={<FileText className="w-5 h-5" />}
            >
              Assignments
            </TabButton>
            <TabButton
              active={activeTab === "students"}
              onClick={() => setActiveTab("students")}
              icon={<Users className="w-5 h-5" />}
            >
              Students
            </TabButton>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <OverviewTab course={course} onCopyCode={handleCopyJoinCode} copiedCode={copiedCode} />
        )}

        {activeTab === "assignments" && (
          <AssignmentsTab
            courseId={courseId!}
            assignments={assignments}
            isLoading={assignmentsLoading}
            onCreateNew={() => setIsCreateModalOpen(true)}
            onClickAssignment={(assignmentId) =>
              navigate(`/professor/courses/${courseId}/assignments/${assignmentId}`)
            }
          />
        )}

        {activeTab === "students" && (
          <StudentsTab students={students} isLoading={studentsLoading} />
        )}
      </div>

      <CreateAssignmentModal
        courseId={courseId!}
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </ProfessorLayout>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function TabButton({ active, onClick, icon, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition",
        active
          ? "border-primary text-primary"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function OverviewTab({
  course,
  onCopyCode,
  copiedCode,
}: {
  course: any;
  onCopyCode: () => void;
  copiedCode: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Course Info */}
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Course Information</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-600">Course Name</label>
              <p className="text-gray-900 mt-1">{course.course_name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Course Code</label>
              <p className="text-gray-900 mt-1">{course.course_code}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Semester</label>
              <p className="text-gray-900 mt-1">{course.semester}</p>
            </div>
            {course.description && (
              <div>
                <label className="text-sm font-medium text-gray-600">Description</label>
                <p className="text-gray-900 mt-1">{course.description}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-600">Created</label>
              <p className="text-gray-900 mt-1">{formatDate(course.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Students</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{course.student_count}</p>
              </div>
              <Users className="w-8 h-8 text-purple-500" />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Assignments</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{course.assignment_count}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Join Code Card */}
      <div className="lg:col-span-1">
        <div className="bg-gradient-to-br from-primary to-primary-600 rounded-xl shadow-sm p-6 text-white">
          <h3 className="text-lg font-semibold mb-2">Course Join Code</h3>
          <p className="text-primary-100 text-sm mb-4">
            Share this code with students to join the course
          </p>
          <div className="bg-white/10 backdrop-blur rounded-lg p-4 mb-4">
            <p className="text-3xl font-mono font-bold text-center tracking-wider">
              {course.join_code || "N/A"}
            </p>
          </div>
          <button
            onClick={onCopyCode}
            className="w-full bg-white text-primary hover:bg-primary-50 font-medium py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
          >
            {copiedCode ? (
              <>
                <Check className="w-5 h-5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" />
                Copy Code
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignmentsTab({
  courseId,
  assignments,
  isLoading,
  onCreateNew,
  onClickAssignment,
}: {
  courseId: string;
  assignments: AssignmentListOut[];
  isLoading: boolean;
  onCreateNew: () => void;
  onClickAssignment: (assignmentId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          {assignments.length} Assignment{assignments.length !== 1 ? "s" : ""}
        </h2>
        <button
          onClick={onCreateNew}
          className="inline-flex items-center px-4 py-2 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Assignment
        </button>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No assignments yet</h3>
          <p className="text-gray-600 mb-6">Create your first assignment to get started.</p>
          <button
            onClick={onCreateNew}
            className="inline-flex items-center px-6 py-3 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Assignment
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assignments.map((assignment) => (
            <AssignmentCard
              key={assignment.id}
              assignment={assignment}
              onClick={() => onClickAssignment(assignment.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({
  assignment,
  onClick,
}: {
  assignment: AssignmentListOut;
  onClick: () => void;
}) {
  const dueDate = new Date(assignment.due_date);
  const isPast = dueDate < new Date();

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition text-left group border border-transparent hover:border-primary-200"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary transition flex-1">
          {assignment.title}
        </h3>
        <GradingModeBadge mode={assignment.grading_mode} />
      </div>

      {assignment.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{assignment.description}</p>
      )}

      <div className="space-y-2">
        <div className="flex items-center text-sm text-gray-600">
          <Calendar className="w-4 h-4 mr-2" />
          <span className={isPast ? "text-red-600 font-medium" : ""}>
            Due {formatDateTime(assignment.due_date)}
          </span>
        </div>
        <div className="flex items-center text-sm text-gray-600">
          <Award className="w-4 h-4 mr-2" />
          {assignment.max_score} points
        </div>
        <div className="flex items-center text-sm text-gray-600">
          <FileText className="w-4 h-4 mr-2" />
          {assignment.submission_count} submission{assignment.submission_count !== 1 ? "s" : ""}
        </div>
      </div>
    </button>
  );
}

function GradingModeBadge({ mode }: { mode: string }) {
  const colors = {
    auto: "bg-green-100 text-green-800",
    manual: "bg-blue-100 text-blue-800",
    hybrid: "bg-purple-100 text-purple-800",
  };

  return (
    <span
      className={cn(
        "px-2 py-1 text-xs font-medium rounded-full",
        colors[mode as keyof typeof colors] || "bg-gray-100 text-gray-800"
      )}
    >
      {mode}
    </span>
  );
}

function StudentsTab({
  students,
  isLoading,
}: {
  students: Array<{ id: string; name: string; email: string; enrolled_at: string; submission_count: number }>;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No students enrolled</h3>
        <p className="text-gray-600">
          Students can join using the course join code displayed in the Overview tab.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Student
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Enrolled
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Submissions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {students.map((student) => (
              <tr key={student.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{student.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-600">{student.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-600">{formatDate(student.enrolled_at)}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-600">{student.submission_count}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
