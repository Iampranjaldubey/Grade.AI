import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, AlertCircle, TrendingUp, Award, Target } from "lucide-react";
import { evaluationsApi } from "@/lib/api";
import * as api from "@/lib/api";
import { ProfessorLayout } from "@/components/ProfessorLayout";
import { formatDateTime, cn } from "@/lib/utils";

export function PendingEvaluationsPage() {
  const navigate = useNavigate();
  const [selectedCourse, setSelectedCourse] = useState<string>("all");

  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: () => api.listCourses(),
  });

  const { data: evaluations = [], isLoading: evaluationsLoading } = useQuery({
    queryKey: ["evaluations", "pending", selectedCourse],
    queryFn: () =>
      evaluationsApi.getPending(selectedCourse === "all" ? undefined : selectedCourse),
  });

  const getConfidenceBadge = (score: number) => {
    if (score < 0.6) return { color: "bg-red-100 text-red-800", label: "Low" };
    if (score < 0.8) return { color: "bg-amber-100 text-amber-800", label: "Medium" };
    return { color: "bg-green-100 text-green-800", label: "High" };
  };

  // Calculate stats
  const stats = {
    totalPending: evaluations.length,
    avgScore:
      evaluations.length > 0
        ? evaluations.reduce((sum, e) => sum + parseFloat(e.ai_score), 0) /
          evaluations.length
        : 0,
    avgConfidence:
      evaluations.length > 0
        ? evaluations.reduce((sum, e) => sum + e.confidence_score, 0) / evaluations.length
        : 0,
  };

  if (coursesLoading || evaluationsLoading) {
    return (
      <ProfessorLayout>
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
          <div className="h-96 bg-gray-200 rounded-xl"></div>
        </div>
      </ProfessorLayout>
    );
  }

  return (
    <ProfessorLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pending Evaluations</h1>
            <p className="text-sm text-gray-600 mt-1">
              Review AI-generated evaluations awaiting approval
            </p>
          </div>

          {/* Course Filter */}
          <div className="w-64">
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="block w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">All Courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.course_code} - {course.course_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Pending</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalPending}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Award className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg AI Score</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.avgScore.toFixed(1)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg Confidence</p>
                <p className="text-2xl font-bold text-gray-900">
                  {(stats.avgConfidence * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Evaluations Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {evaluations.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                All caught up!
              </h3>
              <p className="text-gray-600">No pending evaluations to review.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Student
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assignment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      AI Score
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Confidence
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Submitted At
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {evaluations.map((evaluation) => {
                    const confidence = getConfidenceBadge(evaluation.confidence_score);
                    return (
                      <tr key={evaluation.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {evaluation.student_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {evaluation.student_email}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">
                            {evaluation.assignment_title}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900">
                            {evaluation.ai_score}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                              confidence.color
                            )}
                          >
                            {confidence.label} ({(evaluation.confidence_score * 100).toFixed(0)}%)
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatDateTime(evaluation.evaluated_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() =>
                              navigate(`/professor/evaluations/${evaluation.id}`)
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition"
                          >
                            <Eye className="w-4 h-4" />
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ProfessorLayout>
  );
}
