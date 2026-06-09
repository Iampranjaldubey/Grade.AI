import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, FileText, Users, CheckCircle, Plus } from "lucide-react";
import * as api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { ProfessorLayout } from "@/components/ProfessorLayout";
import { CreateCourseModal } from "@/components/CreateCourseModal";
import { formatDate } from "@/lib/utils";

export function ProfessorDashboard() {
  const { user } = useAuthStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => api.listCourses({ page: 1, size: 3 }),
  });

  const totalCourses = courses.length;
  const totalAssignments = courses.reduce((sum, c) => sum + c.assignment_count, 0);
  const totalStudents = courses.reduce((sum, c) => sum + c.student_count, 0);

  return (
    <ProfessorLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.name?.split(" ")[0] || "Professor"}
          </h1>
          <p className="text-gray-600 mt-2">Here's what's happening with your courses today.</p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            icon={<BookOpen className="w-6 h-6" />}
            label="Total Courses"
            value={totalCourses}
            color="bg-blue-500"
          />
          <StatCard
            icon={<FileText className="w-6 h-6" />}
            label="Total Assignments"
            value={totalAssignments}
            color="bg-green-500"
          />
          <StatCard
            icon={<Users className="w-6 h-6" />}
            label="Total Students"
            value={totalStudents}
            color="bg-purple-500"
          />
          <StatCard
            icon={<CheckCircle className="w-6 h-6" />}
            label="Pending Evaluations"
            value={0}
            color="bg-amber-500"
          />
        </div>

        {/* Recent courses */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Recent Courses</h2>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create New Course
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
              <p className="text-gray-600 mb-6">Create your first course to get started.</p>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center px-6 py-3 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition"
              >
                <Plus className="w-5 h-5 mr-2" />
                Create Course
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {courses.map((course) => (
                <Link
                  key={course.id}
                  to={`/professor/courses/${course.id}`}
                  className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-primary transition">
                        {course.course_name}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">{course.course_code}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-gray-600">
                      <Users className="w-4 h-4 mr-2" />
                      {course.student_count} students
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <FileText className="w-4 h-4 mr-2" />
                      {course.assignment_count} assignments
                    </div>
                    <div className="text-xs text-gray-500 mt-3">
                      {course.semester} • Created {formatDate(course.created_at)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {courses.length > 0 && (
            <div className="mt-6 text-center">
              <Link
                to="/professor/courses"
                className="text-primary hover:text-primary-600 font-medium"
              >
                View all courses →
              </Link>
            </div>
          )}
        </div>
      </div>

      <CreateCourseModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </ProfessorLayout>
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
