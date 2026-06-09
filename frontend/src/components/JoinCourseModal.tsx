import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import * as api from "@/lib/api";
import { cn } from "@/lib/utils";

const joinCodeSchema = z.object({
  join_code: z.string().min(1, "Join code is required").toUpperCase(),
});

type JoinCodeFormData = z.infer<typeof joinCodeSchema>;

interface JoinCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function JoinCourseModal({ isOpen, onClose }: JoinCourseModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<JoinCodeFormData>({
    resolver: zodResolver(joinCodeSchema),
  });

  const joinMutation = useMutation({
    mutationFn: (data: { join_code: string }) => api.joinCourse(data),
    onSuccess: (enrollment) => {
      queryClient.invalidateQueries({ queryKey: ["my-courses"] });
      toast.success(`Successfully joined ${enrollment.course.course_name}!`);
      reset();
      onClose();
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      const message = error.response?.data?.detail || "Failed to join course";
      toast.error(message);
    },
  });

  const onSubmit = (data: JoinCodeFormData) => {
    joinMutation.mutate({ join_code: data.join_code });
  };

  const handleClose = () => {
    if (!joinMutation.isPending) {
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
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md transform transition-all">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Join a Course</h2>
            <button
              onClick={handleClose}
              disabled={joinMutation.isPending}
              className="text-gray-400 hover:text-gray-600 transition disabled:opacity-50"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
            <div>
              <label htmlFor="join_code" className="block text-sm font-medium text-gray-700 mb-2">
                Course Join Code
              </label>
              <input
                {...register("join_code")}
                id="join_code"
                type="text"
                autoComplete="off"
                className={cn(
                  "block w-full px-4 py-3 text-center text-2xl font-mono font-bold uppercase rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent transition tracking-widest",
                  errors.join_code ? "border-red-300 focus:ring-red-500" : "border-gray-300"
                )}
                placeholder="ABC123"
                maxLength={8}
              />
              {errors.join_code && (
                <p className="mt-2 text-sm text-red-600">{errors.join_code.message}</p>
              )}
              <p className="mt-2 text-sm text-gray-600">
                Enter the code provided by your professor
              </p>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={joinMutation.isPending}
                className="px-6 py-2.5 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={joinMutation.isPending}
                className="px-6 py-2.5 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {joinMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Joining...
                  </>
                ) : (
                  "Join Course"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
