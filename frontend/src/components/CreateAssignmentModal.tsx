import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AssignmentCreate, GradingMode } from "@/types";

const assignmentSchema = z.object({
  title: z.string().min(1, "Title is required").max(512, "Title is too long"),
  description: z.string().optional(),
  due_date: z.string().min(1, "Due date is required"),
  max_score: z.coerce.number().min(1, "Max score must be at least 1"),
  grading_mode: z.enum(["auto", "manual", "hybrid"]),
});

type AssignmentFormData = z.infer<typeof assignmentSchema>;

interface CreateAssignmentModalProps {
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CreateAssignmentModal({ courseId, isOpen, onClose }: CreateAssignmentModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      max_score: 100,
      grading_mode: "auto",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: AssignmentCreate) => api.createAssignment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      toast.success("Assignment created successfully!");
      reset();
      onClose();
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      const message = error.response?.data?.detail || "Failed to create assignment";
      toast.error(message);
    },
  });

  const onSubmit = (data: AssignmentFormData) => {
    // Convert datetime-local to ISO format
    const dueDate = new Date(data.due_date).toISOString();
    
    createMutation.mutate({
      course_id: courseId,
      title: data.title,
      description: data.description,
      due_date: dueDate,
      max_score: data.max_score.toString(),
      grading_mode: data.grading_mode as GradingMode,
    });
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
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl transform transition-all">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Create New Assignment</h2>
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
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                Assignment Title *
              </label>
              <input
                {...register("title")}
                id="title"
                type="text"
                className={cn(
                  "block w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent transition",
                  errors.title ? "border-red-300 focus:ring-red-500" : "border-gray-300"
                )}
                placeholder="Assignment 1: Introduction to Python"
              />
              {errors.title && (
                <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
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
                placeholder="Describe the assignment objectives and requirements..."
              />
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Due Date */}
              <div>
                <label htmlFor="due_date" className="block text-sm font-medium text-gray-700 mb-2">
                  Due Date *
                </label>
                <input
                  {...register("due_date")}
                  id="due_date"
                  type="datetime-local"
                  className={cn(
                    "block w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent transition",
                    errors.due_date ? "border-red-300 focus:ring-red-500" : "border-gray-300"
                  )}
                />
                {errors.due_date && (
                  <p className="mt-1 text-sm text-red-600">{errors.due_date.message}</p>
                )}
              </div>

              {/* Max Score */}
              <div>
                <label htmlFor="max_score" className="block text-sm font-medium text-gray-700 mb-2">
                  Max Score *
                </label>
                <input
                  {...register("max_score")}
                  id="max_score"
                  type="number"
                  min="1"
                  className={cn(
                    "block w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent transition",
                    errors.max_score ? "border-red-300 focus:ring-red-500" : "border-gray-300"
                  )}
                  placeholder="100"
                />
                {errors.max_score && (
                  <p className="mt-1 text-sm text-red-600">{errors.max_score.message}</p>
                )}
              </div>
            </div>

            {/* Grading Mode */}
            <div>
              <label htmlFor="grading_mode" className="block text-sm font-medium text-gray-700 mb-2">
                Grading Mode *
              </label>
              <select
                {...register("grading_mode")}
                id="grading_mode"
                className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent transition"
              >
                <option value="auto">Auto - AI-powered grading</option>
                <option value="manual">Manual - Professor grades manually</option>
                <option value="hybrid">Hybrid - AI suggestions + manual review</option>
              </select>
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
                  "Create Assignment"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
