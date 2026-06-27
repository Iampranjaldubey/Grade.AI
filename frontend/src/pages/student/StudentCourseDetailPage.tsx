import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Award,
} from "lucide-react";
import * as api from "@/lib/api";
import { submissionsApi } from "@/lib/api";
import { StudentLayout } from "@/components/StudentLayout";
import { formatDateTime, cn } from "@/lib/utils";

export function StudentCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => api.getCourse(courseId!),
    enabled: !!courseId,
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["assignments", courseId],
    queryFn: () => api.listAssignments({ course_id: courseId! }),
    enabled: !!courseId,
  });

  // Fetch submissions for all assignments
  const { data: submissionsMap = {} } = useQuery({
    queryKey: ["allSubmissions", courseId],
    queryFn: async () => {
      const map: Record<string, any> = {};
      await Promise.all(
        assignments.map(async (assignment) => {
          try {
            const submission = await submissionsApi.getMySubmission(assignment.id);
            map[assignment.id] = submission;
          } catch (error) {
            // No submission for this assignment
            map[assignment.id] = null;
          }
        })
      );
      return map;
    },
    enabled: assignments.length > 0,
  });

  const getStatusBadge = (assignmentId: string, dueDate: string) => {
    const submission = submissionsMap[assignmentId];
    const isPast = new Date(dueDate) < new Date();

    if (!submission) {
      return {
        icon: isPast ? XCircle : Clock,
        color: isPast ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800",
        label: isPast ? "Missing" : "Not Submitted",
      };
    }

    if (submission.status === "evaluated") {
      return {
        icon: CheckCircle,
        color: "bg-green-100 text-green-800",
        label: "Graded",
      };
    }

    if (submission.status === "evaluating") {
      return {
        icon: Clock,
        color: "bg-yellow-100 text-yellow-800",
        label: "Evaluating",
      };
    }

    return {
      icon: CheckCircle,
      color: "bg-blue-100 text-blue-800",
      label: "Submitted",
    };
  };

  if (courseLoading || assignmentsLoading) {
    return (
      <StudentLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded-xl"></div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </StudentLayout>
    );
  }

  if (!course) {
    return (
      <StudentLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900">Course not found</h1>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/student/courses")}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{course.course_name}</h1>
            <p className="text-sm text-gray-600 mt-1">{course.course_code}</p>
          </div>
        </div>

        {/* Course Info */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-600 mb-1">Semester</p>
              <p className="font-medium text-gray-900">{course.semester}</p>
            </div>
            {course.description && (
              <div className="md:col-span-2">
                <p className="text-sm text-gray-600 mb-1">Description</p>
                <p className="text-gray-900">{course.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Assignments */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Assignments</h2>

          {assignments.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">No assignments yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Your professor hasn't created any assignments
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {assignments.map((assignment) => {
                const dueDate = new Date(assignment.due_date);
                const isPast = dueDate < new Date();
                const status = getStatusBadge(assignment.id, assignment.due_date);

                return (
                  <button
                    key={assignment.id}
                    onClick={() => navigate(`/student/assignments/${assignment.id}`)}
                    className="w-full text-left bg-white border border-gray-200 rounded-lg p-5 hover:border-primary hover:shadow-md transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {assignment.title}
                          </h3>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium",
                              status.color
                            )}
                          >
                            <status.icon className="w-3.5 h-3.5" />
                            {status.label}
                          </span>
                        </div>

                        {assignment.description && (
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                            {assignment.description}
                          </p>
                        )}

                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="w-4 h-4" />
                            <span className={cn(isPast && "text-red-600")}>
                              Due {formatDateTime(assignment.due_date)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Award className="w-4 h-4" />
                            <span>{assignment.max_score} points</span>
                          </div>
                        </div>
                      </div>

                      <div className="ml-4">
                        <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </StudentLayout>
  );
}
