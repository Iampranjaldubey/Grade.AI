import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
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
import type { CourseCreate } from "@/types";

const courseSchema = z.object({
  course_name: z
    .string()
    .min(1, "Course name is required")
    .max(255, "Course name is too long"),
  course_code: z
    .string()
    .min(1, "Course code is required")
    .max(64, "Course code is too long"),
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
  } = useForm<CourseFormData>({ resolver: zodResolver(courseSchema) });

  const createMutation = useMutation({
    mutationFn: (data: CourseCreate) => api.createCourse(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      queryClient.invalidateQueries({ queryKey: ["analytics-overview"] });
      toast.success("Course created");
      reset();
      onClose();
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "Failed to create course")),
  });

  const handleOpenChange = (open: boolean) => {
    if (open || createMutation.isPending) return;
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} noValidate>
          <DialogHeader>
            <DialogTitle>Create a course</DialogTitle>
            <DialogDescription>
              Students join with a code generated for you.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <Field
              label="Course name"
              htmlFor="course_name"
              required
              error={errors.course_name?.message}
            >
              <Input
                {...register("course_name")}
                id="course_name"
                placeholder="Introduction to Computer Science"
                invalid={!!errors.course_name}
                aria-describedby={errors.course_name ? "course_name-error" : undefined}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Course code"
                htmlFor="course_code"
                required
                error={errors.course_code?.message}
              >
                <Input
                  {...register("course_code")}
                  id="course_code"
                  placeholder="CS101"
                  invalid={!!errors.course_code}
                  aria-describedby={errors.course_code ? "course_code-error" : undefined}
                />
              </Field>

              <Field
                label="Semester"
                htmlFor="semester"
                required
                error={errors.semester?.message}
              >
                <Input
                  {...register("semester")}
                  id="semester"
                  placeholder="Fall 2026"
                  invalid={!!errors.semester}
                  aria-describedby={errors.semester ? "semester-error" : undefined}
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="description">
              <Textarea
                {...register("description")}
                id="description"
                rows={3}
                placeholder="A brief description of the course…"
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={createMutation.isPending}>
              Create course
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
