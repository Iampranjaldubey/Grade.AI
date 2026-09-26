import { useEffect } from "react";
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
import type { RubricOut } from "@/types";

const criterionSchema = z.object({
  criteria_name: z.string().min(1, "Criterion name is required"),
  description: z.string().optional(),
  max_points: z.coerce.number().min(0.01, "Max points must be greater than 0"),
  weight: z.coerce
    .number()
    .min(0, "Weight can't be negative")
    .max(100, "Weight can't exceed 100"),
  evaluation_hints: z.string().optional(),
});

type CriterionFormData = z.infer<typeof criterionSchema>;

interface EditRubricModalProps {
  rubric: RubricOut;
  isOpen: boolean;
  onClose: () => void;
}

export function EditRubricModal({ rubric, isOpen, onClose }: EditRubricModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CriterionFormData>({
    resolver: zodResolver(criterionSchema),
    defaultValues: {
      criteria_name: rubric.criteria_name,
      description: rubric.description || "",
      max_points: Number(rubric.max_points),
      weight: Number(rubric.weight),
      evaluation_hints: rubric.evaluation_hints || "",
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        criteria_name: rubric.criteria_name,
        description: rubric.description || "",
        max_points: Number(rubric.max_points),
        weight: Number(rubric.weight),
        evaluation_hints: rubric.evaluation_hints || "",
      });
    }
  }, [isOpen, rubric, reset]);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<RubricOut>) => api.updateRubric(rubric.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rubrics", rubric.assignment_id] });
      toast.success("Rubric criterion updated");
      onClose();
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "Failed to update rubric criterion. Check that weights sum to 100%.")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteRubric(rubric.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rubrics", rubric.assignment_id] });
      toast.success("Rubric criterion deleted");
      onClose();
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "Failed to delete rubric criterion")),
  });

  const handleOpenChange = (open: boolean) => {
    if (open || updateMutation.isPending || deleteMutation.isPending) return;
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete ${rubric.criteria_name}? This action cannot be undone.`)) {
      deleteMutation.mutate();
    }
  };

  const onSubmit = (data: CriterionFormData) => {
    updateMutation.mutate({
      criteria_name: data.criteria_name,
      description: data.description,
      max_points: data.max_points.toString(),
      weight: data.weight.toString(),
      evaluation_hints: data.evaluation_hints,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Edit criterion</DialogTitle>
            <DialogDescription>
              Update criterion details. Total weight across all rubrics must remain 100%.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Criterion name"
                htmlFor="edit_criteria_name"
                required
                error={errors.criteria_name?.message}
                className="sm:col-span-2"
              >
                <Input
                  {...register("criteria_name")}
                  id="edit_criteria_name"
                  placeholder="Code quality"
                  invalid={!!errors.criteria_name}
                />
              </Field>

              <Field
                label="Max points"
                htmlFor="edit_max_points"
                required
                error={errors.max_points?.message}
              >
                <Input
                  {...register("max_points")}
                  id="edit_max_points"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="10"
                  invalid={!!errors.max_points}
                />
              </Field>

              <Field
                label="Weight (%)"
                htmlFor="edit_weight"
                required
                error={errors.weight?.message}
              >
                <Input
                  {...register("weight")}
                  id="edit_weight"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="25"
                  invalid={!!errors.weight}
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="edit_description">
              <Textarea
                {...register("description")}
                id="edit_description"
                rows={2}
                placeholder="What does this criterion evaluate?"
              />
            </Field>

            <Field
              label="Evaluation hints"
              htmlFor="edit_evaluation_hints"
              hint="Guidance the AI should follow when scoring this criterion."
            >
              <Input
                {...register("evaluation_hints")}
                id="edit_evaluation_hints"
                placeholder="Award full marks only when edge cases are handled"
                aria-describedby="edit_evaluation_hints-hint"
              />
            </Field>
          </DialogBody>

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              disabled={deleteMutation.isPending || updateMutation.isPending}
            >
              Delete criterion
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
