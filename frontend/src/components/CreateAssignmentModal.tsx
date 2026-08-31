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
  Select,
  Textarea,
} from "@/components/ui";
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

export function CreateAssignmentModal({
  courseId,
  isOpen,
  onClose,
}: CreateAssignmentModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { max_score: 100, grading_mode: "auto" },
  });

  const createMutation = useMutation({
    mutationFn: (data: AssignmentCreate) => api.createAssignment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments", courseId] });
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["analytics-overview"] });
      toast.success("Assignment created");
      reset();
      onClose();
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "Failed to create assignment")),
  });

  const onSubmit = (data: AssignmentFormData) => {
    createMutation.mutate({
      course_id: courseId,
      title: data.title,
      description: data.description,
      // datetime-local gives a local value; the API expects ISO.
      due_date: new Date(data.due_date).toISOString(),
      max_score: data.max_score.toString(),
      grading_mode: data.grading_mode as GradingMode,
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (open || createMutation.isPending) return;
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Create an assignment</DialogTitle>
            <DialogDescription>
              You'll add the grading rubric once it's created.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <Field
              label="Title"
              htmlFor="title"
              required
              error={errors.title?.message}
            >
              <Input
                {...register("title")}
                id="title"
                placeholder="Assignment 1: Introduction to Python"
                invalid={!!errors.title}
                aria-describedby={errors.title ? "title-error" : undefined}
              />
            </Field>

            <Field label="Description" htmlFor="description">
              <Textarea
                {...register("description")}
                id="description"
                rows={4}
                placeholder="Describe the objectives and requirements…"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Due date"
                htmlFor="due_date"
                required
                error={errors.due_date?.message}
              >
                <Input
                  {...register("due_date")}
                  id="due_date"
                  type="datetime-local"
                  invalid={!!errors.due_date}
                  aria-describedby={errors.due_date ? "due_date-error" : undefined}
                />
              </Field>

              <Field
                label="Total points"
                htmlFor="max_score"
                required
                error={errors.max_score?.message}
              >
                <Input
                  {...register("max_score")}
                  id="max_score"
                  type="number"
                  min="1"
                  placeholder="100"
                  invalid={!!errors.max_score}
                  aria-describedby={errors.max_score ? "max_score-error" : undefined}
                />
              </Field>
            </div>

            <Field
              label="Grading mode"
              htmlFor="grading_mode"
              required
              hint="How submissions for this assignment get graded."
            >
              <Select
                {...register("grading_mode")}
                id="grading_mode"
                aria-describedby="grading_mode-hint"
              >
                <option value="auto">Auto — AI drafts every grade</option>
                <option value="manual">Manual — you grade each submission</option>
                <option value="hybrid">Hybrid — AI suggests, you review</option>
              </Select>
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
              Create assignment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
