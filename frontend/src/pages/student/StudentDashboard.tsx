import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, FileText, Plus, Calendar, Clock, CheckCircle } from "lucide-react";
import * as api from "@/lib/api";
import { submissionsApi } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { StudentLayout } from "@/components/StudentLayout";
import { JoinCourseModal } from "@/components/JoinCourseModal";
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

  // Aggregate assignments across every enrolled course.
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

  // Pending = active assignment this student has not submitted yet.
  const pendingSubmissions = activeAssignments.filter(
    (a) => !submissionMap[a.assignment.id],
  ).length;

  // Upcoming = active, not yet due, soonest first.
  const upcomingAssignments = activeAssignments
    .filter((a) => new Date(a.assignment.due_date).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.assignment.due_date).getTime() -
        new Date(b.assignment.due_date).getTime(),
    )
    .slice(0, 5);

  const enrolledCoursesCount = courses.length;

  return (
    <StudentLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.name?.split(" ")[0] || "Student"}
          </h1>
          <p className="text-gray-600 mt-2">Here's an overview of your academic progress.</p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StatCard
            icon={<BookOpen className="w-6 h-6" />}
            label="Enrolled Courses"
            value={enrolledCoursesCount}
            color="bg-blue-500"
          />
          <StatCard
            icon={<FileText className="w-6 h-6" />}
            label="Pending Submissions"
            value={pendingSubmissions}
            color="bg-amber-500"
          />
        </div>

        {/* My Courses Section */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">My Courses</h2>
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition"
            >
              <Plus className="w-5 h-5 mr-2" />
              Join a Course
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No courses yet</h3>
              <p className="text-gray-600 mb-6">
                Get started by joining a course using a course code from your professor.
              </p>
              <button
                onClick={() => setIsJoinModalOpen(true)}
                className="inline-flex items-center px-6 py-3 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition"
              >
                <Plus className="w-5 h-5 mr-2" />
                Join a Course
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {courses.slice(0, 3).map((course) => (
                  <div
                    key={course.id}
                    className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition group"
                  >
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary transition">
                        {course.course_name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">{course.course_code}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="w-4 h-4 mr-2" />
                        {course.semester}
                      </div>
                      {course.description && (
                        <p className="text-sm text-gray-600 line-clamp-2 mt-2">
                          {course.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {courses.length > 3 && (
                <div className="mt-6 text-center">
                  <a
                    href="/student/courses"
                    className="text-primary hover:text-primary-600 font-medium"
                  >
                    View all courses →
                  </a>
                </div>
              )}
            </>
          )}
        </div>

        {/* Upcoming Assignments */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Upcoming Assignments</h2>
          {upcomingAssignments.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No upcoming assignments
              </h3>
              <p className="text-gray-600">
                You're all caught up. New assignments will appear here as your
                professors post them.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
              {upcomingAssignments.map(({ assignment, courseCode }) => {
                const submitted = !!submissionMap[assignment.id];
                return (
                  <Link
                    key={assignment.id}
                    to={`/student/assignments/${assignment.id}`}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 transition"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {assignment.title}
                      </p>
                      <div className="flex items-center gap-3 text-sm text-gray-600 mt-1">
                        <span>{courseCode}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          Due {formatDate(assignment.due_date)}
                        </span>
                      </div>
                    </div>
                    {submitted ? (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                        <CheckCircle className="w-3 h-3" />
                        Submitted
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                        Not submitted
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <JoinCourseModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} />
    </StudentLayout>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}

function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        <div className={`${color} p-3 rounded-lg text-white`}>{icon}</div>
      </div>
    </div>
  );
}
