import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  User,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Save,
  ThumbsUp,
  RefreshCw,
  Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { evaluationsApi, submissionsApi } from "@/lib/api";
import { ProfessorLayout } from "@/components/ProfessorLayout";
import { formatDateTime, cn } from "@/lib/utils";

const overrideSchema = z.object({
  final_score: z.coerce.number().min(0, "Score must be non-negative"),
  professor_feedback: z.string().min(10, "Feedback must be at least 10 characters"),
});

type OverrideFormData = z.infer<typeof overrideSchema>;

export function EvaluationReviewPage() {
  const { evaluationId } = useParams<{ evaluationId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedCriteria, setExpandedCriteria] = useState<Set<number>>(new Set());
  const [isOverriding, setIsOverriding] = useState(false);

  const { data: evaluation, isLoading } = useQuery({
    queryKey: ["evaluation", evaluationId],
    queryFn: () => evaluationsApi.getDetail(evaluationId!),
    enabled: !!evaluationId,
  });

  const { data: submission } = useQuery({
    queryKey: ["submission", evaluation?.submission_id],
    queryFn: async () => {
      const allSubmissions = await submissionsApi.getAllSubmissions(
        evaluation!.submission_id
      );
      return allSubmissions[0];
    },
    enabled: !!evaluation?.submission_id,
  });

  const approveMutation = useMutation({
    mutationFn: (feedback?: string) => evaluationsApi.approve(evaluationId!, feedback),
    onSuccess: () => {
      toast.success("Grade approved successfully!");
      queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] });
      queryClient.invalidateQueries({ queryKey: ["evaluations"] });
      navigate(-1);
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      const message = error.response?.data?.detail || "Failed to approve grade";
      toast.error(message);
    },
  });

  const overrideMutation = useMutation({
    mutationFn: (data: OverrideFormData) =>
      evaluationsApi.override(evaluationId!, {
        final_score: data.final_score,
        professor_feedback: data.professor_feedback,
      }),
    onSuccess: () => {
      toast.success("Grade overridden successfully!");
      queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] });
      queryClient.invalidateQueries({ queryKey: ["evaluations"] });
      navigate(-1);
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      const message = error.response?.data?.detail || "Failed to override grade";
      toast.error(message);
    },
  });

  const reEvaluateMutation = useMutation({
    mutationFn: () => evaluationsApi.trigger(evaluation!.submission_id),
    onSuccess: () => {
      toast.success("Re-evaluation triggered! Refreshing in 3 seconds...");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["evaluation", evaluationId] });
      }, 3000);
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      const message = error.response?.data?.detail || "Failed to trigger re-evaluation";
      toast.error(message);
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OverrideFormData>({
    resolver: zodResolver(overrideSchema),
  });

  const toggleCriterion = (index: number) => {
    setExpandedCriteria((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const getConfidenceBadge = (score: number) => {
    if (score < 0.6) return { color: "bg-red-100 text-red-800", label: "Low", icon: XCircle };
    if (score < 0.8)
      return { color: "bg-amber-100 text-amber-800", label: "Medium", icon: AlertTriangle };
    return { color: "bg-green-100 text-green-800", label: "High", icon: CheckCircle };
  };

  if (isLoading) {
    return (
      <ProfessorLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-96 bg-gray-200 rounded-xl"></div>
            </div>
            <div className="h-96 bg-gray-200 rounded-xl"></div>
          </div>
        </div>
      </ProfessorLayout>
    );
  }

  if (!evaluation || !evaluation.ai_feedback) {
    return (
      <ProfessorLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900">Evaluation not found</h1>
        </div>
      </ProfessorLayout>
    );
  }

  const confidence = getConfidenceBadge(evaluation.ai_feedback.confidence_score);
  const isApproved = evaluation.approval_status !== "pending";

  return (
    <ProfessorLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Evaluation Review</h1>
            <p className="text-sm text-gray-600 mt-1">
              Review and approve AI-generated evaluation
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Evaluation Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Student & Submission Info */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {submission?.student_name || "Student"}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {submission?.student_email || ""}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Submitted</p>
                  <p className="text-sm font-medium text-gray-900">
                    {submission ? formatDateTime(submission.submitted_at) : "-"}
                  </p>
                </div>
              </div>

              {/* AI Score */}
              <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-6 mb-6">
                <div className="text-center">
                  <p className="text-sm font-medium text-primary mb-2">AI Score</p>
                  <div className="text-5xl font-bold text-primary mb-2">
                    {evaluation.ai_score}
                  </div>
                  <div className="text-lg text-primary-700">
                    {evaluation.ai_feedback.percentage.toFixed(1)}%
                  </div>
                </div>
              </div>

              {/* Confidence Badge */}
              <div className="flex items-center justify-center gap-2 mb-6">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium",
                    confidence.color
                  )}
                >
                  <confidence.icon className="w-4 h-4" />
                  {confidence.label} Confidence ({(evaluation.ai_feedback.confidence_score * 100).toFixed(0)}%)
                </span>
              </div>
            </div>

            {/* Criteria Breakdown */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Criteria Breakdown
              </h3>
              <div className="space-y-3">
                {evaluation.ai_feedback.criteria_scores.map((criterion, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => toggleCriterion(index)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <h4 className="font-medium text-gray-900 text-left">
                            {criterion.criterion_name}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {criterion.awarded} / {criterion.max} points
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-sm font-medium px-3 py-1 rounded-full",
                            criterion.awarded === criterion.max
                              ? "bg-green-100 text-green-800"
                              : criterion.awarded >= criterion.max * 0.7
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                          )}
                        >
                          {((criterion.awarded / criterion.max) * 100).toFixed(0)}%
                        </span>
                        {expandedCriteria.has(index) ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>
                    {expandedCriteria.has(index) && (
                      <div className="px-4 pb-4 bg-gray-50 border-t border-gray-200">
                        <p className="text-sm text-gray-700 mt-3">{criterion.reasoning}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Strengths, Weaknesses, Missing Topics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Strengths */}
              {evaluation.strengths && evaluation.strengths.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-green-900 mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Strengths
                  </h3>
                  <div className="space-y-2">
                    {evaluation.strengths.map((strength, index) => (
                      <div
                        key={index}
                        className="bg-green-50 border border-green-200 rounded-lg p-3"
                      >
                        <p className="text-sm text-green-800">{strength}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Weaknesses */}
              {evaluation.weaknesses && evaluation.weaknesses.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-amber-900 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Weaknesses
                  </h3>
                  <div className="space-y-2">
                    {evaluation.weaknesses.map((weakness, index) => (
                      <div
                        key={index}
                        className="bg-amber-50 border border-amber-200 rounded-lg p-3"
                      >
                        <p className="text-sm text-amber-800">{weakness}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Topics */}
              {evaluation.missing_topics && evaluation.missing_topics.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-red-900 mb-3 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Missing Topics
                  </h3>
                  <div className="space-y-2">
                    {evaluation.missing_topics.map((topic, index) => (
                      <div
                        key={index}
                        className="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5"
                      >
                        <p className="text-sm text-red-800">{topic}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Overall Feedback */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Overall AI Feedback
              </h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-700 whitespace-pre-wrap">
                  {typeof evaluation.ai_feedback === "string"
                    ? evaluation.ai_feedback
                    : "No overall feedback provided"}
                </p>
              </div>
            </div>
          </div>

          {/* Right Column - Professor Actions */}
          <div className="space-y-6">
            {/* Re-evaluate Button */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <button
                onClick={() => reEvaluateMutation.mutate()}
                disabled={reEvaluateMutation.isPending || isApproved}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reEvaluateMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Re-evaluating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Re-evaluate
                  </>
                )}
              </button>
              <p className="text-xs text-gray-500 text-center mt-2">
                Trigger a new AI evaluation
              </p>
            </div>

            {/* Approve Button */}
            {!isApproved && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <button
                  onClick={() => approveMutation.mutate(undefined)}
                  disabled={approveMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {approveMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <ThumbsUp className="w-5 h-5" />
                      Approve Grade
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-500 text-center mt-2">
                  Accept AI score as final grade
                </p>
              </div>
            )}

            {/* Override Section */}
            {!isApproved && !isOverriding && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <button
                  onClick={() => setIsOverriding(true)}
                  className="w-full px-4 py-3 border-2 border-primary text-primary hover:bg-primary-50 font-medium rounded-lg transition"
                >
                  Override Grade
                </button>
                <p className="text-xs text-gray-500 text-center mt-2">
                  Manually adjust the final score
                </p>
              </div>
            )}

            {isOverriding && !isApproved && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Override Grade
                </h3>
                <form
                  onSubmit={handleSubmit((data) => overrideMutation.mutate(data))}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Final Score *
                    </label>
                    <input
                      {...register("final_score")}
                      type="number"
                      step="0.01"
                      className={cn(
                        "block w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent",
                        errors.final_score ? "border-red-300" : "border-gray-300"
                      )}
                      placeholder="85"
                    />
                    {errors.final_score && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.final_score.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Professor Feedback *
                    </label>
                    <textarea
                      {...register("professor_feedback")}
                      rows={6}
                      className={cn(
                        "block w-full px-3 py-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary focus:border-transparent resize-none",
                        errors.professor_feedback ? "border-red-300" : "border-gray-300"
                      )}
                      placeholder="Explain why you're overriding the AI score..."
                    />
                    {errors.professor_feedback && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors.professor_feedback.message}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={overrideMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {overrideMutation.isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-5 h-5" />
                          Save Override
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsOverriding(false)}
                      className="px-4 py-3 text-gray-700 hover:bg-gray-100 font-medium rounded-lg transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Approval Status */}
            {isApproved && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Grade {evaluation.approval_status === "approved" ? "Approved" : "Overridden"}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {evaluation.approved_at
                      ? formatDateTime(evaluation.approved_at)
                      : "Recently approved"}
                  </p>
                  {evaluation.final_score && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-600 mb-1">Final Score</p>
                      <p className="text-2xl font-bold text-primary">
                        {evaluation.final_score}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProfessorLayout>
  );
}
