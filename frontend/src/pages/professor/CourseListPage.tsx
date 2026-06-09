import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, BookOpen, Users, FileText } from "lucide-react";
import * as api from "@/lib/api";
import { ProfessorLayout } from "@/components/ProfessorLayout";
import { CreateCourseModal } from "@/components/CreateCourseModal";
import { formatDate } from "@/lib/utils";

export function CourseListPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => api.listCourses(),
  });

  return (
    <ProfessorLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Courses</h1>
            <p className="text-gray-600 mt-2">Manage all your courses in one place.</p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Course
          </button>
        </div>

        {/* Courses grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
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
              Get started by creating your first course.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center px-6 py-3 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Course
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course) => (
              <Link
                key={course.id}
                to={`/professor/courses/${course.id}`}
                className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition group border border-transparent hover:border-primary-200"
              >
                <div className="mb-4">
                  <h3 className="text-xl font-semibold text-gray-900 group-hover:text-primary transition mb-1">
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

                <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center text-sm text-gray-600">
                    <Users className="w-4 h-4 mr-1.5" />
                    <span className="font-medium">{course.student_count}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <FileText className="w-4 h-4 mr-1.5" />
                    <span className="font-medium">{course.assignment_count}</span>
                  </div>
                </div>

                <div className="mt-4 text-xs text-gray-500">
                  Created {formatDate(course.created_at)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <CreateCourseModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </ProfessorLayout>
  );
}
