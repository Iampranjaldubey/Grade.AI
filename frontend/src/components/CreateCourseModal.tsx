import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CourseCreate } from "@/types";

const courseSchema = z.object({
  course_name: z.string().min(1, "Course name is required").max(255, "Course name is too long"),
  course_code: z.string().min(1, "Course code is required").max(64, "Course code is too long"),
  semester: z.string().min(1, "Semester is required").max(64, "Semester is too long"),
  description: z.string().optional(),
});

type CourseFormData = z.infer<typeof courseSchema>;

interface CreateCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateCourseModal({ isOpen, onClose }: CreateCourseModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CourseFormData>({
    resolver: zodResolver(courseSchema),
  });

  const createMutation = useMutation({
    mutationFn: (data: CourseCreate) => api.createCourse(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast.success("Course created successfully!");
      reset();
      onClose();
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      const message = error.response?.data?.detail || "Failed to create course";
      toast.error(message);
    },
  });

  const onSubmit = (data: CourseFormData) => {
    createMutation.mutate(data);
  };

  const handleClose = () => {
    if (!createMutation.isPending) {
      reset();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg transform transition-all">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Create New Course</h2>
            <button
              onClick={handleClose}
              disabled={createMutation.isPending}
              className="text-gray-400 hover:text-gray-600 transition disabled:opacity-50"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
            {/* Course Name */}
            <div>
              <label htmlFor="course_name" className="block text-sm font-medium text-gray-700 mb-2">
                Course Name *
              </label>
              <input
                {...register("course_name")}
                id="course_name"
                type="text"
                className={cn(
                  "block w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent transition",
                  errors.course_name ? "border-red-300 focus:ring-red-500" : "border-gray-300"
                )}
                placeholder="Introduction to Computer Science"
              />
              {errors.course_name && (
                <p className="mt-1 text-sm text-red-600">{errors.course_name.message}</p>
              )}
            </div>

            {/* Course Code */}
            <div>
              <label htmlFor="course_code" className="block text-sm font-medium text-gray-700 mb-2">
                Course Code *
              </label>
              <input
                {...register("course_code")}
                id="course_code"
                type="text"
                className={cn(
                  "block w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent transition",
                  errors.course_code ? "border-red-300 focus:ring-red-500" : "border-gray-300"
                )}
                placeholder="CS101"
              />
              {errors.course_code && (
                <p className="mt-1 text-sm text-red-600">{errors.course_code.message}</p>
              )}
            </div>

            {/* Semester */}
            <div>
              <label htmlFor="semester" className="block text-sm font-medium text-gray-700 mb-2">
                Semester *
              </label>
              <input
                {...register("semester")}
                id="semester"
                type="text"
                className={cn(
                  "block w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent transition",
                  errors.semester ? "border-red-300 focus:ring-red-500" : "border-gray-300"
                )}
                placeholder="Fall 2026"
              />
              {errors.semester && (
                <p className="mt-1 text-sm text-red-600">{errors.semester.message}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description (Optional)
              </label>
              <textarea
                {...register("description")}
                id="description"
                rows={4}
                className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent transition resize-none"
                placeholder="A brief description of the course..."
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={createMutation.isPending}
                className="px-6 py-2.5 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-6 py-2.5 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {createMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Creating...
                  </>
                ) : (
                  "Create Course"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
