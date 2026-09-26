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
  Select,
  Textarea,
} from "@/components/ui";
import type { AssignmentOut, GradingMode } from "@/types";

const assignmentSchema = z.object({
  title: z.string().min(1, "Title is required").max(512, "Title is too long"),
  description: z.string().optional(),
  due_date: z.string().min(1, "Due date is required"),
  max_score: z.coerce.number().min(1, "Max score must be at least 1"),
  grading_mode: z.enum(["auto", "manual", "hybrid"]),
});

type AssignmentFormData = z.infer<typeof assignmentSchema>;

interface EditAssignmentModalProps {
  assignment: AssignmentOut;
  isOpen: boolean;
  onClose: () => void;
}

export function EditAssignmentModal({
  assignment,
  isOpen,
  onClose,
}: EditAssignmentModalProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // The due date from the backend is an ISO string. We need to convert it to a local string for the datetime-local input.
  const formatForInput = (isoString: string) => {
    const date = new Date(isoString);
    // Adjust for local timezone offset to get YYYY-MM-DDTHH:mm format
    const offset = date.getTimezoneOffset() * 60000;
    const localISOTime = new Date(date.getTime() - offset).toISOString().slice(0, 16);
    return localISOTime;
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AssignmentFormData>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      title: assignment.title,
      description: assignment.description || "",
      due_date: formatForInput(assignment.due_date),
      max_score: Number(assignment.max_score),
      grading_mode: assignment.grading_mode,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        title: assignment.title,
        description: assignment.description || "",
        due_date: formatForInput(assignment.due_date),
        max_score: Number(assignment.max_score),
        grading_mode: assignment.grading_mode,
      });
    }
  }, [isOpen, assignment, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<import("@/types").AssignmentCreate>) =>
      api.updateAssignment(assignment.id, data),
    onSuccess: (updatedAssignment) => {
      queryClient.setQueryData(["assignment", assignment.id], updatedAssignment);
      queryClient.invalidateQueries({ queryKey: ["assignments", assignment.course_id] });
      queryClient.invalidateQueries({ queryKey: ["analytics-overview"] });
      toast.success("Assignment updated");
      onClose();
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "Failed to update assignment")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAssignment(assignment.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments", assignment.course_id] });
      queryClient.invalidateQueries({ queryKey: ["course", assignment.course_id] });
      queryClient.invalidateQueries({ queryKey: ["analytics-overview"] });
      toast.success("Assignment deleted");
      onClose();
      navigate(`/professor/courses/${assignment.course_id}`);
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "Failed to delete assignment")),
  });

  const onSubmit = (data: AssignmentFormData) => {
    updateMutation.mutate({
      title: data.title,
      description: data.description,
      due_date: new Date(data.due_date).toISOString(),
      max_score: data.max_score.toString(),
      grading_mode: data.grading_mode as GradingMode,
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (open || updateMutation.isPending || deleteMutation.isPending) return;
    onClose();
  };

  const handleDelete = () => {
    if (
      window.confirm(
        `Are you sure you want to delete ${assignment.title}? This action cannot be undone.`
      )
    ) {
      deleteMutation.mutate();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Edit assignment</DialogTitle>
            <DialogDescription>
              Update details or remove this assignment. Note: you cannot update or delete if submissions have already been graded.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <Field
              label="Title"
              htmlFor="edit_title"
              required
              error={errors.title?.message}
            >
              <Input
                {...register("title")}
                id="edit_title"
                placeholder="Assignment 1: Introduction to Python"
                invalid={!!errors.title}
                aria-describedby={errors.title ? "edit_title-error" : undefined}
              />
            </Field>

            <Field label="Description" htmlFor="edit_description">
              <Textarea
                {...register("description")}
                id="edit_description"
                rows={4}
                placeholder="Describe the objectives and requirements…"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Due date"
                htmlFor="edit_due_date"
                required
                error={errors.due_date?.message}
              >
                <Input
                  {...register("due_date")}
                  id="edit_due_date"
                  type="datetime-local"
                  invalid={!!errors.due_date}
                  aria-describedby={errors.due_date ? "edit_due_date-error" : undefined}
                />
              </Field>

              <Field
                label="Total points"
                htmlFor="edit_max_score"
                required
                error={errors.max_score?.message}
              >
                <Input
                  {...register("max_score")}
                  id="edit_max_score"
                  type="number"
                  min="1"
                  placeholder="100"
                  invalid={!!errors.max_score}
                  aria-describedby={errors.max_score ? "edit_max_score-error" : undefined}
                />
              </Field>
            </div>

            <Field
              label="Grading mode"
              htmlFor="edit_grading_mode"
              required
              hint="How submissions for this assignment get graded."
            >
              <Select
                {...register("grading_mode")}
                id="edit_grading_mode"
                aria-describedby="edit_grading_mode-hint"
              >
                <option value="auto">Auto — AI drafts every grade</option>
                <option value="manual">Manual — you grade each submission</option>
                <option value="hybrid">Hybrid — AI suggests, you review</option>
              </Select>
            </Field>
          </DialogBody>

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              disabled={deleteMutation.isPending || updateMutation.isPending}
            >
              Delete assignment
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
