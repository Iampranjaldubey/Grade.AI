import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Plus } from "lucide-react";
import * as api from "@/lib/api";
import { StudentLayout } from "@/components/StudentLayout";
import { JoinCourseModal } from "@/components/JoinCourseModal";
import { formatDate } from "@/lib/utils";

export function StudentCoursesPage() {
  const navigate = useNavigate();
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["my-courses"],
    queryFn: () => api.getMyCourses(),
  });

  return (
    <StudentLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Courses</h1>
            <p className="text-gray-600 mt-2">View and manage your enrolled courses.</p>
          </div>
          <button
            onClick={() => setIsJoinModalOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition"
          >
            <Plus className="w-5 h-5 mr-2" />
            Join Course
          </button>
        </div>

        {/* Courses Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-6"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No courses yet</h3>
            <p className="text-gray-600 mb-6">
              Join a course using a course code provided by your professor.
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <button
                key={course.id}
                onClick={() => navigate(`/student/courses/${course.id}`)}
                className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition border border-transparent hover:border-primary-200 text-left"
              >
                <div className="mb-4">
                  <h3 className="text-xl font-semibold text-gray-900 mb-1">
                    {course.course_name}
                  </h3>
                  <p className="text-sm font-medium text-gray-600">{course.course_code}</p>
                  <p className="text-xs text-gray-500 mt-1">{course.semester}</p>
                </div>

                {course.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {course.description}
                  </p>
                )}

                <div className="pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500">
                    Enrolled {formatDate(course.created_at)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <JoinCourseModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} />
    </StudentLayout>
  );
}
