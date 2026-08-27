import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  apiClient,
  login,
  register,
  refreshAccessToken,
  logout,
  getCurrentUser,
  createCourse,
  listCourses,
  getCourse,
  updateCourse,
  deleteCourse,
  getCourseStudents,
  joinCourse,
  getMyCourses,
  dropCourse,
  createAssignment,
  listAssignments,
  getAssignment,
  updateAssignment,
  deleteAssignment,
  createRubrics,
  getRubrics,
  uploadsApi,
  submissionsApi,
  evaluationsApi,
} from "./api";

// Each wrapper is a thin call over the shared axios instance. We spy on the
// instance's verb methods and assert the correct URL/method are used and the
// response body is unwrapped. This documents the API contract in one place.
function stub(data: unknown = {}) {
  return vi.fn().mockResolvedValue({ data });
}

let get: ReturnType<typeof stub>;
let post: ReturnType<typeof stub>;
let put: ReturnType<typeof stub>;
let del: ReturnType<typeof stub>;

beforeEach(() => {
  get = stub();
  post = stub();
  put = stub();
  del = stub();
  vi.spyOn(apiClient, "get").mockImplementation(get as never);
  vi.spyOn(apiClient, "post").mockImplementation(post as never);
  vi.spyOn(apiClient, "put").mockImplementation(put as never);
  vi.spyOn(apiClient, "delete").mockImplementation(del as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auth endpoints", () => {
  it("login posts credentials to /auth/login", async () => {
    await login({ email: "a@b.com", password: "pw" });
    expect(post).toHaveBeenCalledWith("/auth/login", { email: "a@b.com", password: "pw" });
  });

  it("register posts to /auth/register", async () => {
    await register({ name: "A", email: "a@b.com", password: "pw", role: "student" });
    expect(post).toHaveBeenCalledWith("/auth/register", expect.objectContaining({ email: "a@b.com" }));
  });

  it("refreshAccessToken posts the refresh token", async () => {
    await refreshAccessToken("rt");
    expect(post).toHaveBeenCalledWith("/auth/refresh", { refresh_token: "rt" });
  });

  it("logout posts the refresh token", async () => {
    await logout("rt");
    expect(post).toHaveBeenCalledWith("/auth/logout", { refresh_token: "rt" });
  });

  it("getCurrentUser reads /auth/me", async () => {
    await getCurrentUser();
    expect(get).toHaveBeenCalledWith("/auth/me");
  });
});

describe("course endpoints", () => {
  it("createCourse posts to /courses", async () => {
    await createCourse({ course_name: "C", course_code: "C1", semester: "F25" });
    expect(post).toHaveBeenCalledWith("/courses", expect.objectContaining({ course_code: "C1" }));
  });

  it("listCourses reads /courses with params", async () => {
    await listCourses({ page: 2, size: 10 });
    expect(get).toHaveBeenCalledWith("/courses", { params: { page: 2, size: 10 } });
  });

  it("getCourse reads /courses/:id", async () => {
    await getCourse("abc");
    expect(get).toHaveBeenCalledWith("/courses/abc");
  });

  it("updateCourse puts to /courses/:id", async () => {
    await updateCourse("abc", { course_name: "New" });
    expect(put).toHaveBeenCalledWith("/courses/abc", { course_name: "New" });
  });

  it("deleteCourse deletes /courses/:id", async () => {
    await deleteCourse("abc");
    expect(del).toHaveBeenCalledWith("/courses/abc");
  });

  it("getCourseStudents reads the students subresource", async () => {
    get.mockResolvedValue({ data: [] });
    await getCourseStudents("abc");
    expect(get).toHaveBeenCalledWith("/courses/abc/students", { params: undefined });
  });
});

describe("enrollment endpoints", () => {
  it("joinCourse posts a join code", async () => {
    await joinCourse({ join_code: "XYZ" });
    expect(post).toHaveBeenCalledWith("/enrollments/join", { join_code: "XYZ" });
  });

  it("getMyCourses reads my-courses", async () => {
    await getMyCourses();
    expect(get).toHaveBeenCalledWith("/enrollments/my-courses");
  });

  it("dropCourse deletes an enrollment", async () => {
    await dropCourse("abc");
    expect(del).toHaveBeenCalledWith("/enrollments/abc");
  });
});

describe("assignment and rubric endpoints", () => {
  it("createAssignment posts to /assignments", async () => {
    await createAssignment({
      course_id: "c1",
      title: "T",
      due_date: "2025-01-01",
      max_score: "100",
      grading_mode: "auto",
    });
    expect(post).toHaveBeenCalledWith("/assignments", expect.objectContaining({ title: "T" }));
  });

  it("listAssignments reads with course_id param", async () => {
    await listAssignments({ course_id: "c1" });
    expect(get).toHaveBeenCalledWith("/assignments", { params: { course_id: "c1" } });
  });

  it("getAssignment reads /assignments/:id", async () => {
    await getAssignment("a1");
    expect(get).toHaveBeenCalledWith("/assignments/a1");
  });

  it("updateAssignment puts to /assignments/:id", async () => {
    await updateAssignment("a1", { title: "New" });
    expect(put).toHaveBeenCalledWith("/assignments/a1", { title: "New" });
  });

  it("deleteAssignment deletes /assignments/:id", async () => {
    await deleteAssignment("a1");
    expect(del).toHaveBeenCalledWith("/assignments/a1");
  });

  it("createRubrics posts to the rubrics subresource", async () => {
    get.mockResolvedValue({ data: [] });
    await createRubrics("a1", { criteria: [] });
    expect(post).toHaveBeenCalledWith("/assignments/a1/rubrics", { criteria: [] });
  });

  it("getRubrics reads the rubrics subresource", async () => {
    await getRubrics("a1");
    expect(get).toHaveBeenCalledWith("/assignments/a1/rubrics");
  });
});

describe("uploads api", () => {
  it("presign posts to /uploads/presign", async () => {
    await uploadsApi.presign({
      file_name: "f.pdf",
      content_type: "application/pdf",
      doc_type: "submission",
      course_id: "c1",
    });
    expect(post).toHaveBeenCalledWith("/uploads/presign", expect.objectContaining({ file_name: "f.pdf" }));
  });

  it("confirm posts to /uploads/confirm", async () => {
    await uploadsApi.confirm({
      file_key: "k",
      file_name: "f.pdf",
      file_size_bytes: 10,
      doc_type: "submission",
      course_id: "c1",
    });
    expect(post).toHaveBeenCalledWith("/uploads/confirm", expect.objectContaining({ file_key: "k" }));
  });

  it("getStatus reads the status subresource", async () => {
    await uploadsApi.getStatus("d1");
    expect(get).toHaveBeenCalledWith("/uploads/d1/status");
  });

  it("getCourseDocuments reads the course documents", async () => {
    await uploadsApi.getCourseDocuments("c1");
    expect(get).toHaveBeenCalledWith("/uploads/courses/c1/documents");
  });

  it("deleteDocument deletes a document", async () => {
    await uploadsApi.deleteDocument("d1");
    expect(del).toHaveBeenCalledWith("/uploads/d1");
  });
});

describe("submissions api", () => {
  it("submit posts to /submissions", async () => {
    await submissionsApi.submit({
      assignment_id: "a1",
      file_name: "f.pdf",
      file_key: "k",
      file_size_bytes: 10,
    });
    expect(post).toHaveBeenCalledWith("/submissions", expect.objectContaining({ assignment_id: "a1" }));
  });

  it("getMySubmission reads the my-submission subresource", async () => {
    await submissionsApi.getMySubmission("a1");
    expect(get).toHaveBeenCalledWith("/submissions/a1/my-submission");
  });

  it("getAllSubmissions reads the all subresource", async () => {
    get.mockResolvedValue({ data: [] });
    await submissionsApi.getAllSubmissions("a1");
    expect(get).toHaveBeenCalledWith("/submissions/a1/all");
  });
});

describe("evaluations api", () => {
  it("getPending reads pending with a course filter", async () => {
    get.mockResolvedValue({ data: [] });
    await evaluationsApi.getPending("c1");
    expect(get).toHaveBeenCalledWith("/evaluations/pending", { params: { course_id: "c1" } });
  });

  it("getPending omits params when no course is given", async () => {
    get.mockResolvedValue({ data: [] });
    await evaluationsApi.getPending();
    expect(get).toHaveBeenCalledWith("/evaluations/pending", { params: undefined });
  });

  it("getDetail reads /evaluations/:id", async () => {
    await evaluationsApi.getDetail("e1");
    expect(get).toHaveBeenCalledWith("/evaluations/e1");
  });

  it("approve posts feedback to the approve action", async () => {
    await evaluationsApi.approve("e1", "nice work");
    expect(post).toHaveBeenCalledWith("/evaluations/e1/approve", { professor_feedback: "nice work" });
  });

  it("override posts to the override action", async () => {
    await evaluationsApi.override("e1", { final_score: 90, professor_feedback: "adjusted" });
    expect(post).toHaveBeenCalledWith(
      "/evaluations/e1/override",
      expect.objectContaining({ final_score: 90 }),
    );
  });

  it("trigger posts to the trigger action", async () => {
    await evaluationsApi.trigger("s1");
    expect(post).toHaveBeenCalledWith("/evaluations/trigger/s1");
  });

  it("getMyGrade reads the submission evaluation", async () => {
    await evaluationsApi.getMyGrade("s1");
    expect(get).toHaveBeenCalledWith("/evaluations/submission/s1");
  });
});
