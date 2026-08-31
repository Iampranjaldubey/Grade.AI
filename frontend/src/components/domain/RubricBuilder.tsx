import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  CheckCircle2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import * as api from "@/lib/api";
import { getErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Textarea,
} from "@/components/ui";
import type { RubricCreate, RubricOut } from "@/types";

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

interface RubricBuilderProps {
  assignmentId: string;
  rubrics: RubricOut[];
  isLoading?: boolean;
}

const WEIGHT_TOLERANCE = 0.01;

/**
 * Define the criteria GradeAI grades against.
 *
 * Extracted from the previously monolithic assignment page. Saved rubrics are
 * shown read-only until you choose to edit, at which point they're loaded into a
 * draft list that must total 100% before it can be saved.
 */
export function RubricBuilder({
  assignmentId,
  rubrics,
  isLoading = false,
}: RubricBuilderProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RubricCreate[] | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CriterionFormData>({ resolver: zodResolver(criterionSchema) });

  const saveMutation = useMutation({
    mutationFn: (criteria: RubricCreate[]) =>
      api.createRubrics(assignmentId, { criteria }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rubrics", assignmentId] });
      toast.success("Rubric saved");
      setDraft(null);
      setIsAdding(false);
      reset();
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error, "Failed to save rubric")),
  });

  const isEditing = draft !== null;
  const rows: Array<RubricCreate | RubricOut> = isEditing ? draft : rubrics;
  const totalWeight = rows.reduce((sum, r) => sum + parseFloat(r.weight || "0"), 0);
  const weightValid = Math.abs(totalWeight - 100) < WEIGHT_TOLERANCE;

  const startEditing = () =>
    setDraft(
      rubrics.map((r) => ({
        criteria_name: r.criteria_name,
        description: r.description || undefined,
        max_points: r.max_points,
        weight: r.weight,
        evaluation_hints: r.evaluation_hints || undefined,
      })),
    );

  const addCriterion = (data: CriterionFormData) => {
    const next: RubricCreate = {
      criteria_name: data.criteria_name,
      description: data.description || undefined,
      max_points: data.max_points.toString(),
      weight: data.weight.toString(),
      evaluation_hints: data.evaluation_hints || undefined,
    };
    setDraft((prev) => [...(prev ?? []), next]);
    reset();
    setIsAdding(false);
  };

  const removeCriterion = (index: number) =>
    setDraft((prev) => (prev ?? []).filter((_, i) => i !== index));

  const handleSave = () => {
    if (!draft?.length) {
      toast.error("Add at least one criterion before saving");
      return;
    }
    if (!weightValid) {
      toast.error(
        `Weights must total 100% — currently ${totalWeight.toFixed(2)}%`,
      );
      return;
    }
    saveMutation.mutate(draft);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Grading rubric</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Grading rubric</CardTitle>
          <p className="mt-0.5 text-sm text-content-muted">
            GradeAI scores every submission against these criteria.
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          {rows.length > 0 && <WeightIndicator total={totalWeight} valid={weightValid} />}
          {!isEditing && rubrics.length > 0 && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {rows.length === 0 && !isAdding ? (
          <EmptyState
            icon={AlertCircle}
            title="No rubric yet"
            description="Add criteria so GradeAI knows exactly what to grade against. Weights must total 100%."
            action={
              <Button
                onClick={() => {
                  setDraft([]);
                  setIsAdding(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add criterion
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((criterion, index) => (
              <li
                key={`${criterion.criteria_name}-${index}`}
                className={cn(
                  "rounded-md border p-4",
                  isEditing
                    ? "border-brand/30 bg-brand-subtle/40"
                    : "border-edge bg-surface-raised",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-medium text-content">
                    {criterion.criteria_name}
                  </h4>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Badge tone="neutral">{criterion.weight}%</Badge>
                    <Badge tone="neutral">{criterion.max_points} pts</Badge>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => removeCriterion(index)}
                        aria-label={`Remove ${criterion.criteria_name}`}
                        className="rounded-md p-1.5 text-content-muted hover:bg-danger-subtle hover:text-danger-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-safe:transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {criterion.description && (
                  <p className="mt-1.5 text-sm text-content-soft">
                    {criterion.description}
                  </p>
                )}
                {criterion.evaluation_hints && (
                  <p className="mt-1.5 text-sm italic text-content-muted">
                    Hint: {criterion.evaluation_hints}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Add-criterion form */}
        {isAdding ? (
          <form
            onSubmit={handleSubmit(addCriterion)}
            className="space-y-4 rounded-md border border-edge bg-surface-raised p-4"
            noValidate
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Criterion name"
                htmlFor="criteria_name"
                required
                error={errors.criteria_name?.message}
                className="sm:col-span-2"
              >
                <Input
                  {...register("criteria_name")}
                  id="criteria_name"
                  placeholder="Code quality"
                  invalid={!!errors.criteria_name}
                />
              </Field>

              <Field
                label="Max points"
                htmlFor="max_points"
                required
                error={errors.max_points?.message}
              >
                <Input
                  {...register("max_points")}
                  id="max_points"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="10"
                  invalid={!!errors.max_points}
                />
              </Field>

              <Field
                label="Weight (%)"
                htmlFor="weight"
                required
                error={errors.weight?.message}
              >
                <Input
                  {...register("weight")}
                  id="weight"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="25"
                  invalid={!!errors.weight}
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="description">
              <Textarea
                {...register("description")}
                id="description"
                rows={2}
                placeholder="What does this criterion evaluate?"
              />
            </Field>

            <Field
              label="Evaluation hints"
              htmlFor="evaluation_hints"
              hint="Guidance the AI should follow when scoring this criterion."
            >
              <Input
                {...register("evaluation_hints")}
                id="evaluation_hints"
                placeholder="Award full marks only when edge cases are handled"
                aria-describedby="evaluation_hints-hint"
              />
            </Field>

            <div className="flex gap-2">
              <Button type="submit" size="sm">
                <Plus className="h-4 w-4" />
                Add criterion
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAdding(false);
                  reset();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          (isEditing || rows.length > 0) && (
            <Button
              variant="outline"
              block
              onClick={() => {
                if (!isEditing) startEditing();
                setIsAdding(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add criterion
            </Button>
          )
        )}

        {/* Save / cancel draft */}
        {isEditing && !isAdding && (
          <div className="flex flex-col gap-2 border-t border-edge-subtle pt-4 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null);
                reset();
              }}
            >
              <X className="h-4 w-4" />
              Discard changes
            </Button>
            <Button onClick={handleSave} isLoading={saveMutation.isPending}>
              {!saveMutation.isPending && <Save className="h-4 w-4" />}
              Save rubric
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WeightIndicator({ total, valid }: { total: number; valid: boolean }) {
  const rounded = Math.round(total * 100) / 100;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium",
        valid ? "bg-success-subtle text-success-fg" : "bg-warning-subtle text-warning-fg",
      )}
      role="status"
    >
      {valid ? (
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      ) : (
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
      )}
      {rounded}% of 100%
    </span>
  );
}
