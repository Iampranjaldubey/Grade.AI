import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./api";

function axiosLikeError(status: number, data: unknown, message = "Request failed") {
  return {
    isAxiosError: true,
    message,
    response: { status, data },
  };
}

describe("getErrorMessage", () => {
  it("returns a friendly conflict message for 409 when the backend omits one", () => {
    const err = axiosLikeError(409, {});
    expect(getErrorMessage(err)).toMatch(/already updated by someone else/i);
  });

  it("prefers the backend message on a 409", () => {
    const err = axiosLikeError(409, { message: "Evaluation already approved." });
    expect(getErrorMessage(err)).toBe("Evaluation already approved.");
  });

  it("returns a friendly size message for 413 when the backend omits one", () => {
    const err = axiosLikeError(413, {});
    expect(getErrorMessage(err)).toMatch(/too large/i);
  });

  it("prefers the backend message on a 413", () => {
    const err = axiosLikeError(413, { message: "File exceeds 25 MB." });
    expect(getErrorMessage(err)).toBe("File exceeds 25 MB.");
  });

  it("uses the backend { message } shape for other statuses", () => {
    const err = axiosLikeError(400, { message: "Invalid join code." });
    expect(getErrorMessage(err)).toBe("Invalid join code.");
  });

  it("falls back to FastAPI { detail } string", () => {
    const err = axiosLikeError(422, { detail: "Validation failed." });
    expect(getErrorMessage(err)).toBe("Validation failed.");
  });

  it("reads the first message from a FastAPI { detail: [...] } array", () => {
    const err = axiosLikeError(422, {
      detail: [{ msg: "field required", type: "value_error", loc: ["body"] }],
    });
    expect(getErrorMessage(err)).toBe("field required");
  });

  it("falls back to the axios error message when there is no response body", () => {
    const err = { isAxiosError: true, message: "Network Error" };
    expect(getErrorMessage(err)).toBe("Network Error");
  });

  it("uses the provided fallback for a completely opaque error", () => {
    expect(getErrorMessage(undefined, "boom")).toBe("boom");
  });
});
