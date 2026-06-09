import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Plus, Calendar } from "lucide-react";
import * as api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { StudentLayout } from "@/components/StudentLayout";
import { JoinCourseModal } from "@/components/JoinCourseModal";
import { formatDate } from "@/lib/utils";

export function StudentDashboard() {
  const { user } = useAuthStore();
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["my-courses"],
    queryFn: () => api.getMyCourses(),
  });

  const enrolledCoursesCount = courses.length;
  const pendingSubmissions = 0; // Placeholder for now

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

        {/* Upcoming Assignments (Placeholder) */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Upcoming Assignments</h2>
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No upcoming assignments</h3>
            <p className="text-gray-600">
              Assignment tracking will be available once courses have active assignments.
            </p>
          </div>
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
