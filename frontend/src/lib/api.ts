import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import type {
  ApiError,
  AssignmentCreate,
  AssignmentListOut,
  AssignmentOut,
  CourseCreate,
  CourseListOut,
  CourseOut,
  CourseUpdate,
  EnrollmentOut,
  JoinCourseRequest,
  LoginCredentials,
  RegisterPayload,
  RubricListCreate,
  RubricOut,
  TokenResponse,
  UserOut,
} from "@/types";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

export const apiClient = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

// Request interceptor: attach access token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken = localStorage.getItem("gradeai_access_token");
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 with refresh logic
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem("gradeai_refresh_token");
      if (!refreshToken) {
        // No refresh token, logout
        localStorage.removeItem("gradeai_access_token");
        localStorage.removeItem("gradeai_refresh_token");
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post<TokenResponse>(
          `${baseURL}/auth/refresh`,
          { refresh_token: refreshToken }
        );
        localStorage.setItem("gradeai_access_token", data.access_token);
        localStorage.setItem("gradeai_refresh_token", data.refresh_token);
        processQueue(null);
        isRefreshing = false;

        // Retry original request
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        }
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError as Error);
        isRefreshing = false;
        // Refresh failed, logout
        localStorage.removeItem("gradeai_access_token");
        localStorage.removeItem("gradeai_refresh_token");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export async function login(credentials: LoginCredentials): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>("/auth/login", credentials);
  return data;
}

export async function register(payload: RegisterPayload): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>("/auth/register", payload);
  return data;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { data } = await apiClient.post<TokenResponse>("/auth/refresh", {
    refresh_token: refreshToken,
  });
  return data;
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post("/auth/logout", { refresh_token: refreshToken });
}

export async function getCurrentUser(): Promise<UserOut> {
  const { data } = await apiClient.get<UserOut>("/auth/me");
  return data;
}

// ---------------------------------------------------------------------------
// Course API
// ---------------------------------------------------------------------------

export async function createCourse(payload: CourseCreate): Promise<CourseListOut> {
  const { data } = await apiClient.post<CourseListOut>("/courses", payload);
  return data;
}

export async function listCourses(params?: {
  page?: number;
  size?: number;
}): Promise<CourseListOut[]> {
  const { data } = await apiClient.get<CourseListOut[]>("/courses", { params });
  return data;
}

export async function getCourse(courseId: string): Promise<CourseListOut> {
  const { data } = await apiClient.get<CourseListOut>(`/courses/${courseId}`);
  return data;
}

export async function updateCourse(
  courseId: string,
  payload: CourseUpdate
): Promise<CourseListOut> {
  const { data } = await apiClient.put<CourseListOut>(`/courses/${courseId}`, payload);
  return data;
}

export async function deleteCourse(courseId: string): Promise<void> {
  await apiClient.delete(`/courses/${courseId}`);
}

export async function getCourseStudents(
  courseId: string,
  params?: { page?: number; size?: number }
): Promise<
  Array<{
    id: string;
    name: string;
    email: string;
    enrolled_at: string;
    submission_count: number;
  }>
> {
  const { data } = await apiClient.get(`/courses/${courseId}/students`, { params });
  return data;
}

// ---------------------------------------------------------------------------
// Enrollment API
// ---------------------------------------------------------------------------

export async function joinCourse(payload: JoinCourseRequest): Promise<EnrollmentOut> {
  const { data } = await apiClient.post<EnrollmentOut>("/enrollments/join", payload);
  return data;
}

export async function getMyCourses(): Promise<CourseOut[]> {
  const { data } = await apiClient.get<CourseOut[]>("/enrollments/my-courses");
  return data;
}

export async function dropCourse(courseId: string): Promise<void> {
  await apiClient.delete(`/enrollments/${courseId}`);
}

// ---------------------------------------------------------------------------
// Assignment API
// ---------------------------------------------------------------------------

export async function createAssignment(
  payload: AssignmentCreate
): Promise<AssignmentListOut> {
  const { data } = await apiClient.post<AssignmentListOut>("/assignments", payload);
  return data;
}

export async function listAssignments(params: {
  course_id: string;
  page?: number;
  size?: number;
}): Promise<AssignmentListOut[]> {
  const { data } = await apiClient.get<AssignmentListOut[]>("/assignments", { params });
  return data;
}

export async function getAssignment(assignmentId: string): Promise<AssignmentOut> {
  const { data } = await apiClient.get<AssignmentOut>(`/assignments/${assignmentId}`);
  return data;
}

export async function updateAssignment(
  assignmentId: string,
  payload: Partial<AssignmentCreate>
): Promise<AssignmentOut> {
  const { data } = await apiClient.put<AssignmentOut>(
    `/assignments/${assignmentId}`,
    payload
  );
  return data;
}

export async function deleteAssignment(assignmentId: string): Promise<void> {
  await apiClient.delete(`/assignments/${assignmentId}`);
}

// ---------------------------------------------------------------------------
// Rubric API
// ---------------------------------------------------------------------------

export async function createRubrics(
  assignmentId: string,
  payload: RubricListCreate
): Promise<RubricOut[]> {
  const { data } = await apiClient.post<RubricOut[]>(
    `/assignments/${assignmentId}/rubrics`,
    payload
  );
  return data;
}

export async function getRubrics(assignmentId: string): Promise<RubricOut[]> {
  const { data } = await apiClient.get<RubricOut[]>(`/assignments/${assignmentId}/rubrics`);
  return data;
}

// ---------------------------------------------------------------------------
// Uploads API
// ---------------------------------------------------------------------------

export const uploadsApi = {
  presign: async (payload: import("@/types").PresignRequest): Promise<import("@/types").PresignResponse> => {
    const { data } = await apiClient.post<import("@/types").PresignResponse>("/uploads/presign", payload);
    return data;
  },

  confirm: async (payload: import("@/types").ConfirmUploadRequest): Promise<import("@/types").DocumentOut> => {
    const { data } = await apiClient.post<import("@/types").DocumentOut>("/uploads/confirm", payload);
    return data;
  },

  getStatus: async (documentId: string): Promise<{ id: string; file_name: string; parse_status: import("@/types").ParseStatus; chunk_count: number }> => {
    const { data } = await apiClient.get(`/uploads/${documentId}/status`);
    return data;
  },

  getCourseDocuments: async (courseId: string): Promise<import("@/types").DocumentOut[]> => {
    const { data } = await apiClient.get<import("@/types").DocumentOut[]>(`/uploads/courses/${courseId}/documents`);
    return data;
  },

  deleteDocument: async (documentId: string): Promise<void> => {
    await apiClient.delete(`/uploads/${documentId}`);
  },
};

// ---------------------------------------------------------------------------
// Submissions API
// ---------------------------------------------------------------------------

export const submissionsApi = {
  submit: async (payload: import("@/types").SubmissionCreate): Promise<import("@/types").SubmissionOut> => {
    const { data } = await apiClient.post<import("@/types").SubmissionOut>("/submissions", payload);
    return data;
  },

  getMySubmission: async (assignmentId: string): Promise<import("@/types").SubmissionOut> => {
    const { data } = await apiClient.get<import("@/types").SubmissionOut>(`/submissions/${assignmentId}/my-submission`);
    return data;
  },

  getAllSubmissions: async (assignmentId: string): Promise<Array<import("@/types").SubmissionOut & { student_name: string; student_email: string }>> => {
    const { data } = await apiClient.get(`/submissions/${assignmentId}/all`);
    return data;
  },
};

// ---------------------------------------------------------------------------
// Evaluations API
// ---------------------------------------------------------------------------

export const evaluationsApi = {
  getPending: async (courseId?: string): Promise<import("@/types").EvaluationListOut[]> => {
    const { data } = await apiClient.get<import("@/types").EvaluationListOut[]>("/evaluations/pending", {
      params: courseId ? { course_id: courseId } : undefined,
    });
    return data;
  },

  getDetail: async (evaluationId: string): Promise<import("@/types").EvaluationOut> => {
    const { data } = await apiClient.get<import("@/types").EvaluationOut>(`/evaluations/${evaluationId}`);
    return data;
  },

  approve: async (evaluationId: string, feedback?: string): Promise<import("@/types").EvaluationOut> => {
    const { data } = await apiClient.post<import("@/types").EvaluationOut>(
      `/evaluations/${evaluationId}/approve`,
      { professor_feedback: feedback }
    );
    return data;
  },

  override: async (evaluationId: string, payload: import("@/types").OverrideEvaluationRequest): Promise<import("@/types").EvaluationOut> => {
    const { data } = await apiClient.post<import("@/types").EvaluationOut>(
      `/evaluations/${evaluationId}/override`,
      payload
    );
    return data;
  },

  trigger: async (submissionId: string): Promise<{ message: string; submission_id: string; task_id: string }> => {
    const { data } = await apiClient.post(`/evaluations/trigger/${submissionId}`);
    return data;
  },

  getMyGrade: async (submissionId: string): Promise<import("@/types").EvaluationOut> => {
    const { data } = await apiClient.get<import("@/types").EvaluationOut>(`/evaluations/submission/${submissionId}`);
    return data;
  },
};
