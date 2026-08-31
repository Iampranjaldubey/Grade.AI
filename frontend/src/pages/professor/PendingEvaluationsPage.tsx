import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Eye, Gauge, ListChecks, Sparkles } from "lucide-react";
import { evaluationsApi } from "@/lib/api";
import * as api from "@/lib/api";
import { AppShell } from "@/components/layout";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  type Column,
} from "@/components/ui";
import { ConfidenceMeter } from "@/components/domain";
import { formatDateTime } from "@/lib/utils";
import type { EvaluationListOut } from "@/types";

export function PendingEvaluationsPage() {
  const navigate = useNavigate();
  const [selectedCourse, setSelectedCourse] = useState<string>("all");

  const { data: courses = [] } = useQuery({
    queryKey: ["courses"],
    queryFn: () => api.listCourses(),
  });

  const {
    data: evaluations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["evaluations", "pending", selectedCourse],
    queryFn: () =>
      evaluationsApi.getPending(selectedCourse === "all" ? undefined : selectedCourse),
  });

  const stats = {
    totalPending: evaluations.length,
    avgScore:
      evaluations.length > 0
        ? evaluations.reduce((sum, e) => sum + (e.ai_score ? parseFloat(e.ai_score) : 0), 0) /
          evaluations.length
        : 0,
    avgConfidence:
      evaluations.length > 0
        ? evaluations.reduce((sum, e) => sum + e.confidence_score, 0) / evaluations.length
        : 0,
  };

  const columns: Column<EvaluationListOut>[] = [
    {
      id: "student",
      header: "Student",
      sortValue: (e) => e.student_name,
      cell: (e) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-content">{e.student_name}</div>
          <div className="truncate text-xs text-content-muted">{e.student_email}</div>
        </div>
      ),
    },
    {
      id: "assignment",
      header: "Assignment",
      sortValue: (e) => e.assignment_title,
      cell: (e) => <span className="text-content-soft">{e.assignment_title}</span>,
    },
    {
      id: "score",
      header: "AI score",
      align: "left",
      sortValue: (e) => (e.ai_score ? parseFloat(e.ai_score) : -1),
      cell: (e) => (
        <div className="flex flex-col items-start gap-1">
          <span className="font-serif text-base font-semibold text-content">
            {e.ai_score ?? "—"}
          </span>
          {e.is_fallback && (
            <Badge tone="warning" className="whitespace-nowrap">
              Needs review
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "confidence",
      header: "Confidence",
      sortValue: (e) => e.confidence_score,
      cell: (e) => <ConfidenceMeter score={e.confidence_score} />,
    },
    {
      id: "evaluated",
      header: "Evaluated",
      sortValue: (e) => new Date(e.evaluated_at).getTime(),
      cell: (e) => (
        <span className="whitespace-nowrap text-content-muted">
          {formatDateTime(e.evaluated_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (e) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/professor/evaluations/${e.id}`);
          }}
        >
          <Eye className="h-4 w-4" />
          Review
        </Button>
      ),
    },
  ];

  return (
    <AppShell breadcrumbs={[{ label: "Grading Queue" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Grading Queue"
          description="Review AI-drafted evaluations and approve or override each grade."
          actions={
            <div className="w-full sm:w-64">
              <label htmlFor="course-filter" className="sr-only">
                Filter by course
              </label>
              <Select
                id="course-filter"
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
              >
                <option value="all">All courses</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.course_code} — {course.course_name}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            icon={<ListChecks className="h-5 w-5" />}
            label="Awaiting review"
            value={stats.totalPending}
          />
          <StatTile
            icon={<Sparkles className="h-5 w-5" />}
            label="Avg AI score"
            value={stats.avgScore.toFixed(1)}
          />
          <StatTile
            icon={<Gauge className="h-5 w-5" />}
            label="Avg confidence"
            value={`${(stats.avgConfidence * 100).toFixed(0)}%`}
          />
        </div>

        {isError ? (
          <ErrorState
            title="Couldn't load the grading queue"
            description="There was a problem fetching pending evaluations."
            onRetry={() => refetch()}
          />
        ) : (
          <DataTable
            data={evaluations}
            columns={columns}
            getRowId={(e) => e.id}
            isLoading={isLoading}
            onRowClick={(e) => navigate(`/professor/evaluations/${e.id}`)}
            searchable={(e) => `${e.student_name} ${e.student_email} ${e.assignment_title}`}
            searchPlaceholder="Search student or assignment…"
            caption="Pending AI evaluations awaiting professor review"
            empty={
              <EmptyState
                icon={CheckCircle2}
                title="All caught up"
                description="There are no evaluations waiting for your review right now."
              />
            }
          />
        )}
      </div>
    </AppShell>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-subtle text-brand">
        {icon}
      </span>
      <div>
        <p className="text-sm text-content-muted">{label}</p>
        <p className="font-serif text-2xl font-semibold text-content">{value}</p>
      </div>
    </Card>
  );
}
