export type UserRole = "professor" | "student" | "ta" | "admin";

export type GradingMode = "auto" | "manual" | "hybrid";

export type EnrollmentStatus = "active" | "dropped";

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
