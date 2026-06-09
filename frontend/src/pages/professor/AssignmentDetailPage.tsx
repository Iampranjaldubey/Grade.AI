import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Calendar,
  Award,
  Clock,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import * as api from "@/lib/api";
import { ProfessorLayout } from "@/components/ProfessorLayout";
import { formatDateTime, cn } from "@/lib/utils";
import type { RubricCreate } from "@/types";

const rubricSchema = z.object({
  criteria_name: z.string().min(1, "Criteria name is required"),
  description: z.string().optional(),
  max_points: z.coerce.number().min(0.01, "Max points must be positive"),
  weight: z.coerce.number().min(0, "Weight must be positive").max(100, "Weight cannot exceed 100"),
  evaluation_hints: z.string().optional(),
});

type RubricFormData = z.infer<typeof rubricSchema>;

export function AssignmentDetailPage() {
  const { courseId, assignmentId } = useParams<{ courseId: string; assignmentId: string }>();
  const queryClient = useQueryClient();
  const [isAddingCriterion, setIsAddingCriterion] = useState(false);
  const [criteria, setCriteria] = useState<RubricCreate[]>([]);

  const { data: assignment, isLoading: assignmentLoading } = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: () => api.getAssignment(assignmentId!),
    enabled: !!assignmentId,
  });

  const { data: rubrics = [], isLoading: rubricsLoading } = useQuery({
    queryKey: ["rubrics", assignmentId],
    queryFn: () => api.getRubrics(assignmentId!),
    enabled: !!assignmentId,
  });

  const saveRubricsMutation = useMutation({
    mutationFn: (data: { criteria: RubricCreate[] }) =>
      api.createRubrics(assignmentId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rubrics", assignmentId] });
      toast.success("Rubrics saved successfully!");
      setCriteria([]);
      setIsAddingCriterion(false);
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      const message = error.response?.data?.detail || "Failed to save rubrics";
      toast.error(message);
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RubricFormData>({
    resolver: zodResolver(rubricSchema),
  });

  const handleAddCriterion = (data: RubricFormData) => {
    setCriteria([
      ...criteria,
      {
        criteria_name: data.criteria_name,
        description: data.description,
        max_points: data.max_points.toString(),
        weight: data.weight.toString(),
        evaluation_hints: data.evaluation_hints,
      },
    ]);
    reset();
    setIsAddingCriterion(false);
  };

  const handleRemoveCriterion = (index: number) => {
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  const handleSaveRubrics = () => {
    if (criteria.length === 0) {
      toast.error("Add at least one criterion before saving");
      return;
    }

    const totalWeight = criteria.reduce(
      (sum, c) => sum + parseFloat(c.weight),
      0
    );

    if (Math.abs(totalWeight - 100) > 0.01) {
      toast.error(`Total weight must equal 100% (currently ${totalWeight.toFixed(2)}%)`);
      return;
    }

    saveRubricsMutation.mutate({ criteria });
  };

  if (assignmentLoading) {
    return (
      <ProfessorLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </ProfessorLayout>
    );
  }

  if (!assignment) {
    return (
      <ProfessorLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900">Assignment not found</h1>
        </div>
      </ProfessorLayout>
    );
  }

  const dueDate = new Date(assignment.due_date);
  const isPast = dueDate < new Date();
  const totalWeight = criteria.reduce((sum, c) => sum + parseFloat(c.weight), 0);
  const existingWeight = rubrics.reduce((sum, r) => sum + parseFloat(r.weight), 0);
  const displayWeight = criteria.length > 0 ? totalWeight : existingWeight;

  return (
    <ProfessorLayout>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Assignment Info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{assignment.title}</h1>

            {assignment.description && (
              <p className="text-gray-600 mb-6">{assignment.description}</p>
            )}

            <div className="space-y-4">
              <div className="flex items-center text-sm">
                <Calendar className="w-5 h-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-gray-600">Due Date</p>
                  <p className={cn("font-medium", isPast ? "text-red-600" : "text-gray-900")}>
                    {formatDateTime(assignment.due_date)}
                  </p>
                </div>
              </div>

              <div className="flex items-center text-sm">
                <Award className="w-5 h-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-gray-600">Max Score</p>
                  <p className="font-medium text-gray-900">{assignment.max_score} points</p>
                </div>
              </div>

              <div className="flex items-center text-sm">
                <Clock className="w-5 h-5 text-gray-400 mr-3" />
                <div>
                  <p className="text-gray-600">Status</p>
                  <p className={cn("font-medium", isPast ? "text-red-600" : "text-green-600")}>
                    {isPast ? "Closed" : "Open"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <GradingModeBadge mode={assignment.grading_mode} />
            </div>
          </div>
        </div>

        {/* Right Column - Rubric Builder */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Grading Rubric</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Define criteria for evaluating submissions
                </p>
              </div>
              <WeightIndicator weight={displayWeight} />
            </div>

            {/* Existing Rubrics */}
            {rubricsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-gray-200 rounded-lg animate-pulse"></div>
                ))}
              </div>
            ) : rubrics.length > 0 && criteria.length === 0 ? (
              <div className="space-y-4 mb-6">
                {rubrics.map((rubric) => (
                  <div
                    key={rubric.id}
                    className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{rubric.criteria_name}</h3>
                      <span className="text-sm font-medium text-primary">
                        {rubric.weight}%
                      </span>
                    </div>
                    {rubric.description && (
                      <p className="text-sm text-gray-600 mb-2">{rubric.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>Max Points: {rubric.max_points}</span>
                    </div>
                    {rubric.evaluation_hints && (
                      <p className="text-sm text-gray-500 mt-2 italic">
                        Hints: {rubric.evaluation_hints}
                      </p>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => {
                    const existingCriteria = rubrics.map((r) => ({
                      criteria_name: r.criteria_name,
                      description: r.description || undefined,
                      max_points: r.max_points,
                      weight: r.weight,
                      evaluation_hints: r.evaluation_hints || undefined,
                    }));
                    setCriteria(existingCriteria);
                  }}
                  className="w-full py-2 text-sm text-primary hover:bg-primary-50 border border-primary border-dashed rounded-lg transition"
                >
                  Edit Rubrics
                </button>
              </div>
            ) : null}

            {/* New Criteria Being Added */}
            {criteria.length > 0 && (
              <div className="space-y-4 mb-6">
                {criteria.map((criterion, index) => (
                  <div
                    key={index}
                    className="border border-primary-200 rounded-lg p-4 bg-primary-50"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{criterion.criteria_name}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-primary">
                          {criterion.weight}%
                        </span>
                        <button
                          onClick={() => handleRemoveCriterion(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {criterion.description && (
                      <p className="text-sm text-gray-600 mb-2">{criterion.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>Max Points: {criterion.max_points}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Criterion Form */}
            {isAddingCriterion ? (
              <form onSubmit={handleSubmit(handleAddCriterion)} className="space-y-4 mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Criteria Name *
                    </label>
                    <input
                      {...register("criteria_name")}
                      className={cn(
                        "block w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent",
                        errors.criteria_name ? "border-red-300" : "border-gray-300"
                      )}
                      placeholder="Code Quality"
                    />
                    {errors.criteria_name && (
                      <p className="mt-1 text-xs text-red-600">{errors.criteria_name.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Max Points *
                      </label>
                      <input
                        {...register("max_points")}
                        type="number"
                        step="0.01"
                        className={cn(
                          "block w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent",
                          errors.max_points ? "border-red-300" : "border-gray-300"
                        )}
                        placeholder="10"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Weight % *
                      </label>
                      <input
                        {...register("weight")}
                        type="number"
                        step="0.01"
                        className={cn(
                          "block w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent",
                          errors.weight ? "border-red-300" : "border-gray-300"
                        )}
                        placeholder="25"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    {...register("description")}
                    rows={2}
                    className="block w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                    placeholder="Describe what this criterion evaluates..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Evaluation Hints
                  </label>
                  <input
                    {...register("evaluation_hints")}
                    className="block w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Guidelines for AI or manual grading..."
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition"
                  >
                    Add Criterion
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCriterion(false);
                      reset();
                    }}
                    className="px-4 py-2 text-gray-700 text-sm font-medium hover:bg-gray-100 rounded-lg transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsAddingCriterion(true)}
                className="w-full py-3 text-primary hover:bg-primary-50 border border-primary border-dashed rounded-lg transition flex items-center justify-center gap-2 font-medium"
              >
                <Plus className="w-5 h-5" />
                Add Criterion
              </button>
            )}

            {/* Save Button */}
            {criteria.length > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={handleSaveRubrics}
                  disabled={saveRubricsMutation.isPending}
                  className="w-full bg-primary hover:bg-primary-600 text-white font-medium py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saveRubricsMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      Save Rubric
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProfessorLayout>
  );
}

function GradingModeBadge({ mode }: { mode: string }) {
  const colors = {
    auto: "bg-green-100 text-green-800",
    manual: "bg-blue-100 text-blue-800",
    hybrid: "bg-purple-100 text-purple-800",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-3 py-1 text-sm font-medium rounded-full",
        colors[mode as keyof typeof colors] || "bg-gray-100 text-gray-800"
      )}
    >
      {mode.charAt(0).toUpperCase() + mode.slice(1)} Grading
    </span>
  );
}

function WeightIndicator({ weight }: { weight: number }) {
  const isValid = Math.abs(weight - 100) < 0.01;
  const roundedWeight = Math.round(weight * 100) / 100;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold",
        isValid ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      )}
    >
      {isValid ? (
        <CheckCircle className="w-5 h-5" />
      ) : (
        <AlertCircle className="w-5 h-5" />
      )}
      <span>
        {roundedWeight}/100%
      </span>
    </div>
  );
}
