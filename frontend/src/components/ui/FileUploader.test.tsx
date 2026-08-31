import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileUploader } from "./FileUploader";

const MB = 1024 * 1024;

function makeFile(name: string, sizeBytes: number, type = "application/pdf") {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

function renderUploader(overrides: Partial<Parameters<typeof FileUploader>[0]> = {}) {
  const props = {
    accept: ".pdf,.docx",
    maxSizeBytes: 25 * MB,
    state: "idle" as const,
    selectedFile: null,
    onFileSelect: vi.fn(),
    onUpload: vi.fn(),
    onReset: vi.fn(),
    onRejected: vi.fn(),
    ...overrides,
  };
  render(<FileUploader {...props} />);
  return props;
}

describe("FileUploader", () => {
  it("exposes the drop zone as a real button so it is keyboard reachable", () => {
    renderUploader();
    const zone = screen.getByRole("button", { name: /choose a file or drag it here/i });
    expect(zone).toBeInTheDocument();
    expect(zone.tagName).toBe("BUTTON");
  });

  it("rejects a file whose extension is not allowed", () => {
    const props = renderUploader();
    const input = document.querySelector("input[type=file]")!;
    fireEvent.change(input, {
      target: { files: [makeFile("virus.exe", 1024, "application/x-msdownload")] },
    });
    expect(props.onRejected).toHaveBeenCalled();
    expect(props.onFileSelect).not.toHaveBeenCalled();
  });

  it("rejects a file that exceeds the size cap", () => {
    const props = renderUploader({ maxSizeBytes: 1 * MB });
    const input = document.querySelector("input[type=file]")!;
    fireEvent.change(input, { target: { files: [makeFile("big.pdf", 5 * MB)] } });
    expect(props.onRejected).toHaveBeenCalledWith(
      expect.stringContaining("too large"),
    );
    expect(props.onFileSelect).not.toHaveBeenCalled();
  });

  it("accepts a valid file", () => {
    const props = renderUploader();
    const input = document.querySelector("input[type=file]")!;
    fireEvent.change(input, { target: { files: [makeFile("essay.pdf", 2 * MB)] } });
    expect(props.onFileSelect).toHaveBeenCalled();
    expect(props.onRejected).not.toHaveBeenCalled();
  });

  it("reports upload progress accessibly", () => {
    renderUploader({ state: "uploading", progress: 42 });
    const bar = screen.getByRole("progressbar", { name: /upload progress/i });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
  });

  it("announces a failure and offers a retry", () => {
    const props = renderUploader({ state: "failed" });
    expect(screen.getByRole("alert")).toHaveTextContent(/upload failed/i);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(props.onReset).toHaveBeenCalled();
  });
});
