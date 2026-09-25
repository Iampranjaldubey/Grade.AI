import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import * as api from "@/lib/api";
import { getErrorMessage } from "@/lib/api";
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Textarea,
} from "@/components/ui";
import type { CourseListOut, CourseUpdate } from "@/types";

const courseSchema = z.object({
  course_name: z
    .string()
    .min(1, "Course name is required")
    .max(255, "Course name is too long")
    .optional(),
  course_code: z
    .string()
    .min(1, "Course code is required")
    .max(64, "Course code is too long")
    .optional(),
  semester: z
    .string()
    .min(1, "Semester is required")
    .max(64, "Semester is too long")
    .optional(),
  description: z.string().optional(),
});

type CourseFormData = z.infer<typeof courseSchema>;

interface EditCourseModalProps {
  course: CourseListOut;
  isOpen: boolean;
  onClose: () => void;
}

export function EditCourseModal({ course, isOpen, onClose }: EditCourseModalProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CourseFormData>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      course_name: course.course_name,
      course_code: course.course_code,
      semester: course.semester,
      description: course.description || "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        course_name: course.course_name,
        course_code: course.course_code,
        semester: course.semester,
        description: course.description || "",
      });
    }
  }, [isOpen, course, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: CourseUpdate) => api.updateCourse(course.id, data),
    onSuccess: (updatedCourse) => {
      queryClient.setQueryData(["course", course.id], updatedCourse);
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast.success("Course updated");
      onClose();
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "Failed to update course")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteCourse(course.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-overview"] });
      toast.success("Course deleted");
      onClose();
      navigate("/professor/courses");
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "Failed to delete course")),
  });

  const handleOpenChange = (open: boolean) => {
    if (open || updateMutation.isPending || deleteMutation.isPending) return;
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${course.course_code}? This action cannot be undone.`)) {
      deleteMutation.mutate();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit((data) => updateMutation.mutate(data))} noValidate>
          <DialogHeader>
            <DialogTitle>Edit course</DialogTitle>
            <DialogDescription>
              Update course details or remove it entirely.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <Field
              label="Course name"
              htmlFor="edit_course_name"
              required
              error={errors.course_name?.message}
            >
              <Input
                {...register("course_name")}
                id="edit_course_name"
                placeholder="Introduction to Computer Science"
                invalid={!!errors.course_name}
                aria-describedby={errors.course_name ? "edit_course_name-error" : undefined}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Course code"
                htmlFor="edit_course_code"
                required
                error={errors.course_code?.message}
              >
                <Input
                  {...register("course_code")}
                  id="edit_course_code"
                  placeholder="CS101"
                  invalid={!!errors.course_code}
                  aria-describedby={errors.course_code ? "edit_course_code-error" : undefined}
                />
              </Field>

              <Field
                label="Semester"
                htmlFor="edit_semester"
                required
                error={errors.semester?.message}
              >
                <Input
                  {...register("semester")}
                  id="edit_semester"
                  placeholder="Fall 2026"
                  invalid={!!errors.semester}
                  aria-describedby={errors.semester ? "edit_semester-error" : undefined}
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="edit_description">
              <Textarea
                {...register("description")}
                id="edit_description"
                rows={3}
                placeholder="A brief description of the course…"
              />
            </Field>
          </DialogBody>

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending || updateMutation.isPending}
            >
              Delete course
            </Button>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={updateMutation.isPending || deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={updateMutation.isPending} disabled={deleteMutation.isPending}>
                Save changes
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
