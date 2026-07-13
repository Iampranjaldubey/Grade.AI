import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Award,
  FileText,
  Upload,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";
import * as api from "@/lib/api";
import { submissionsApi, evaluationsApi, uploadsApi } from "@/lib/api";
import { StudentLayout } from "@/components/StudentLayout";
import { DocumentUploadZone } from "@/components/DocumentUploadZone";
import { formatDateTime, cn } from "@/lib/utils";
import type { DocumentType } from "@/types";

export function AssignmentSubmissionPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(null);
  const [uploadedFileSize, setUploadedFileSize] = useState<number>(0);
  const [expandedCriteria, setExpandedCriteria] = useState<Set<number>>(new Set());

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

  const { data: submission } = useQuery({
    queryKey: ["mySubmission", assignmentId],
    queryFn: () => submissionsApi.getMySubmission(assignmentId!),
    enabled: !!assignmentId,
    retry: false,
  });

  const { data: evaluation } = useQuery({
    queryKey: ["myEvaluation", submission?.id],
    queryFn: () => evaluationsApi.getMyGrade(submission!.id),
    enabled: !!submission && submission.status === "evaluated",
    retry: false,
  });

  const { data: document } = useQuery({
    queryKey: ["document", uploadedDocumentId],
    queryFn: () => uploadsApi.getStatus(uploadedDocumentId!),
    enabled: !!uploadedDocumentId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.parse_status === "processing" || data.parse_status === "pending"
        ? 2000
        : false;
    },
  });

  const submitMutation = useMutation({
    mutationFn: (data: {
      assignment_id: string;
      file_name: string;
      file_key: string;
      file_size_bytes: number;
    }) => submissionsApi.submit(data),
    onSuccess: () => {
      toast.success("Assignment submitted successfully!");
      queryClient.invalidateQueries({ queryKey: ["mySubmission", assignmentId] });
      setUploadedDocumentId(null);
      setUploadedFileKey(null);
      setUploadedFileSize(0);
      setIsResubmitting(false);
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      const message = error.response?.data?.detail || "Failed to submit assignment";
      toast.error(message);
    },
  });

  const handleUploadSuccess = (documentId: string, fileKey: string, fileSizeBytes: number) => {
    setUploadedDocumentId(documentId);
    setUploadedFileKey(fileKey);
    setUploadedFileSize(fileSizeBytes);
  };

  const handleSubmit = async () => {
    if (!uploadedDocumentId || !document || !uploadedFileKey || !uploadedFileSize) {
      toast.error("Please upload a file first");
      return;
    }

    if (document.parse_status !== "success") {
      toast.error("Please wait for the file to finish processing");
      return;
    }

    submitMutation.mutate({
      assignment_id: assignmentId!,
      file_name: document.file_name,
      file_key: uploadedFileKey,
      file_size_bytes: uploadedFileSize,
    });
  };

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

  if (assignmentLoading || rubricsLoading) {
    return (
      <StudentLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-96 bg-gray-200 rounded-xl"></div>
            <div className="h-96 bg-gray-200 rounded-xl"></div>
          </div>
        </div>
      </StudentLayout>
    );
  }

  if (!assignment) {
    return (
      <StudentLayout>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900">Assignment not found</h1>
        </div>
      </StudentLayout>
    );
  }

  const dueDate = new Date(assignment.due_date);
  const isPast = dueDate < new Date();
  const hasSubmission = !!submission;
  const isEvaluated = submission?.status === "evaluated" && !!evaluation;

  return (
    <StudentLayout>
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
            <h1 className="text-2xl font-bold text-gray-900">{assignment.title}</h1>
            <p className="text-sm text-gray-600 mt-1">Submit your work and view feedback</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Assignment Info */}
          <div className="space-y-6">
            {/* Assignment Details */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Assignment Details
              </h2>

              {assignment.description && (
                <p className="text-gray-700 mb-6">{assignment.description}</p>
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
            </div>

            {/* Rubric */}
            {rubrics.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Grading Rubric
                </h2>
                <div className="space-y-3">
                  {rubrics.map((rubric) => (
                    <div
                      key={rubric.id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-medium text-gray-900">
                          {rubric.criteria_name}
                        </h3>
                        <span className="text-sm font-medium text-primary">
                          {rubric.max_points} pts ({rubric.weight}%)
                        </span>
                      </div>
                      {rubric.description && (
                        <p className="text-sm text-gray-600">{rubric.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Submission Section */}
          <div className="space-y-6">
            {/* State 1: Not Submitted */}
            {!hasSubmission && !isResubmitting && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Submit Assignment
                </h2>

                <DocumentUploadZone
                  accept=".pdf,.doc,.docx,.txt"
                  docType={"submission" as DocumentType}
                  courseId={assignment.course_id}
                  assignmentId={assignmentId}
                  onSuccess={handleUploadSuccess}
                  onError={(error) => toast.error(error.message || "Upload failed")}
                />

                {uploadedDocumentId && document && (
                  <div className="mt-4">
                    <button
                      onClick={handleSubmit}
                      disabled={
                        submitMutation.isPending ||
                        document.parse_status !== "success"
                      }
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitMutation.isPending ? (
                        <>
                          <Clock className="w-5 h-5 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          Submit Assignment
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* State 2: Submitted (Not Evaluated) */}
            {hasSubmission && !isEvaluated && !isResubmitting && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Submission Status
                </h2>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <CheckCircle className="w-6 h-6 text-blue-600" />
                    <div>
                      <p className="font-medium text-blue-900">Submitted Successfully</p>
                      <p className="text-sm text-blue-700">
                        {formatDateTime(submission.submitted_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-blue-800">
                    <FileText className="w-4 h-4" />
                    <span>{submission.file_name}</span>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-3">
                    <Clock className="w-6 h-6 text-yellow-600" />
                    <div>
                      <p className="font-medium text-yellow-900">
                        Evaluation in Progress
                      </p>
                      <p className="text-sm text-yellow-700">
                        Your submission is being evaluated by AI. Check back soon!
                      </p>
                    </div>
                  </div>
                </div>

                {!isPast && (
                  <button
                    onClick={() => setIsResubmitting(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-primary text-primary hover:bg-primary-50 font-medium rounded-lg transition"
                  >
                    <RefreshCw className="w-5 h-5" />
                    Resubmit Assignment
                  </button>
                )}
              </div>
            )}

            {/* State 2b: Resubmitting */}
            {isResubmitting && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Resubmit Assignment
                  </h2>
                  <button
                    onClick={() => {
                      setIsResubmitting(false);
                      setUploadedDocumentId(null);
                    }}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Cancel
                  </button>
                </div>

                <DocumentUploadZone
                  accept=".pdf,.doc,.docx,.txt"
                  docType={"submission" as DocumentType}
                  courseId={assignment.course_id}
                  assignmentId={assignmentId}
                  onSuccess={handleUploadSuccess}
                  onError={(error) => toast.error(error.message || "Upload failed")}
                />

                {uploadedDocumentId && document && (
                  <div className="mt-4">
                    <button
                      onClick={handleSubmit}
                      disabled={
                        submitMutation.isPending ||
                        document.parse_status !== "success"
                      }
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary-600 text-white font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitMutation.isPending ? (
                        <>
                          <Clock className="w-5 h-5 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5" />
                          Submit New Version
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* State 3: Evaluated */}
            {isEvaluated && evaluation && (
              <div className="space-y-6">
                {/* Grade Display */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Grade</h2>

                  <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-8 mb-6">
                    <div className="text-center">
                      <p className="text-sm font-medium text-primary mb-2">Final Score</p>
                      <div className="text-6xl font-bold text-primary mb-2">
                        {evaluation.final_score || evaluation.ai_score}
                      </div>
                      <div className="text-xl text-primary-700">
                        out of {assignment.max_score}
                      </div>
                      {evaluation.ai_feedback && (
                        <div className="text-lg text-primary-700 mt-2">
                          {evaluation.ai_feedback.percentage.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  </div>

                  {evaluation.approval_status !== "pending" && (
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-medium text-green-800">
                        Grade {evaluation.approval_status === "approved" ? "Approved" : "Finalized"} by Professor
                      </span>
                    </div>
                  )}
                </div>

                {/* Feedback */}
                {evaluation.ai_feedback && (
                  <>
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
                              <div>
                                <h4 className="font-medium text-gray-900 text-left">
                                  {criterion.criterion_name}
                                </h4>
                                <p className="text-sm text-gray-600">
                                  {criterion.awarded} / {criterion.max} points
                                </p>
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
                                <p className="text-sm text-gray-700 mt-3">
                                  {criterion.reasoning}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Strengths & Weaknesses */}
                    <div className="grid grid-cols-1 gap-4">
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

                      {evaluation.weaknesses && evaluation.weaknesses.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm p-6">
                          <h3 className="text-sm font-semibold text-amber-900 mb-3 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            Areas for Improvement
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

                      {evaluation.missing_topics && evaluation.missing_topics.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm p-6">
                          <h3 className="text-sm font-semibold text-red-900 mb-3">
                            Missing Topics
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {evaluation.missing_topics.map((topic, index) => (
                              <span
                                key={index}
                                className="bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-1 rounded-full"
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Professor Feedback */}
                    {evaluation.professor_feedback && (
                      <div className="bg-white rounded-xl shadow-sm p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                          Professor Feedback
                        </h3>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-gray-700 whitespace-pre-wrap">
                            {evaluation.professor_feedback}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}
