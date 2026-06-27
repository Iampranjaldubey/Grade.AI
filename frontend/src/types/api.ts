export type UserRole = "professor" | "student" | "ta" | "admin";

export type GradingMode = "auto" | "manual" | "hybrid";

export type EnrollmentStatus = "active" | "dropped";

export type ParseStatus = "pending" | "processing" | "success" | "failed";

export type SubmissionStatus = "submitted" | "evaluating" | "evaluated" | "late";

export type ApprovalStatus = "pending" | "approved" | "overridden";

export type DocumentType = "rubric" | "notes" | "sample_solution" | "submission";

export interface UserOut {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserOut | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface CourseOut {
  id: string;
  course_name: string;
  course_code: string;
  professor_id: string;
  semester: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourseListOut extends CourseOut {
  student_count: number;
  assignment_count: number;
  join_code?: string;
}

export interface CourseCreate {
  course_name: string;
  course_code: string;
  semester: string;
  description?: string;
}

export interface CourseUpdate {
  course_name?: string;
  course_code?: string;
  semester?: string;
  description?: string;
}

export interface AssignmentOut {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  due_date: string;
  max_score: string;
  grading_mode: GradingMode;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignmentListOut extends AssignmentOut {
  submission_count: number;
}

export interface AssignmentCreate {
  course_id: string;
  title: string;
  description?: string;
  due_date: string;
  max_score: string;
  grading_mode: GradingMode;
}

export interface RubricOut {
  id: string;
  assignment_id: string;
  criteria_name: string;
  description: string | null;
  max_points: string;
  weight: string;
  evaluation_hints: string | null;
  created_at: string;
}

export interface RubricCreate {
  criteria_name: string;
  description?: string;
  max_points: string;
  weight: string;
  evaluation_hints?: string;
}

export interface RubricListCreate {
  criteria: RubricCreate[];
}

export interface EnrollmentOut {
  id: string;
  course_id: string;
  student_id: string;
  enrolled_at: string;
  status: EnrollmentStatus;
  course: CourseOut;
}

export interface JoinCourseRequest {
  join_code: string;
}

export interface DocumentOut {
  id: string;
  course_id: string;
  assignment_id: string | null;
  uploader_id: string;
  doc_type: DocumentType;
  file_name: string;
  file_url: string;
  mime_type: string;
  file_size_bytes: number;
  parse_status: ParseStatus;
  created_at: string;
}

export interface SubmissionOut {
  id: string;
  assignment_id: string;
  student_id: string;
  file_url: string;
  file_name: string;
  submitted_at: string;
  status: SubmissionStatus;
}

export interface EvaluationOut {
  id: string;
  submission_id: string;
  ai_score: string;
  final_score: string | null;
  ai_feedback: {
    criteria_scores: Array<{
      criterion_name: string;
      awarded: number;
      max: number;
      reasoning: string;
    }>;
    percentage: number;
    confidence_score: number;
  } | null;
  professor_feedback: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  missing_topics: string[] | null;
  approval_status: ApprovalStatus;
  evaluated_at: string;
  approved_at: string | null;
}

export interface EvaluationListOut {
  id: string;
  submission_id: string;
  ai_score: string;
  approval_status: ApprovalStatus;
  evaluated_at: string;
  confidence_score: number;
  student_name: string;
  student_email: string;
  assignment_title: string;
}

export interface PresignRequest {
  file_name: string;
  content_type: string;
  doc_type: DocumentType;
  course_id: string;
  assignment_id?: string;
}

export interface PresignResponse {
  upload_url: string;
  file_key: string;
  expires_in: number;
}

export interface ConfirmUploadRequest {
  file_key: string;
  file_name: string;
  file_size_bytes: number;
  doc_type: DocumentType;
  course_id: string;
  assignment_id?: string;
}

export interface SubmissionCreate {
  assignment_id: string;
  file_name: string;
  file_key: string;
  file_size_bytes: number;
}

export interface ApproveEvaluationRequest {
  professor_feedback?: string;
}

export interface OverrideEvaluationRequest {
  final_score: number;
  professor_feedback: string;
  criteria_overrides?: Array<{
    criterion_name: string;
    awarded: number;
  }>;
}

export interface ApiError {
  detail: string | { msg: string; type: string; loc: string[] }[];
  code?: string;
  message?: string;
  request_id?: string;
  details?: Record<string, unknown>;
}

export interface HealthResponse {
  status: string;
  version: string;
  environment: string;
}

// Legacy alias
export type User = UserOut;
