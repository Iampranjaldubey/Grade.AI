import { useCallback, useRef, useState } from "react";
import { CheckCircle2, FileText, Upload, XCircle } from "lucide-react";
import { cn, formatFileSize } from "@/lib/utils";
import { Button } from "./Button";
import { Spinner } from "./Spinner";

export type FileUploaderState =
  | "idle"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

interface FileUploaderProps {
  /** Comma-separated extension list, e.g. ".pdf,.docx". */
  accept: string;
  maxSizeBytes: number;
  state: FileUploaderState;
  /** Upload progress 0–100, shown while `state` is "uploading". */
  progress?: number;
  selectedFile: File | null;
  onFileSelect: (file: File) => void;
  onUpload: () => void;
  onReset: () => void;
  onRejected: (message: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Presentational drop zone for a single file.
 *
 * The previous implementation was a `div` with an `onClick`, so it could not be
 * reached or activated by keyboard. This renders a real `<button>` and keeps all
 * colours on design tokens (it previously hard-coded `bg-blue-600`, a third
 * palette alongside the brand and editorial colours).
 *
 * Upload orchestration stays with the caller; this component only renders state.
 */
export function FileUploader({
  accept,
  maxSizeBytes,
  state,
  progress = 0,
  selectedFile,
  onFileSelect,
  onUpload,
  onReset,
  onRejected,
  disabled = false,
  className,
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const validateAndSelect = useCallback(
    (file: File) => {
      const accepted = accept.split(",").map((t) => t.trim().toLowerCase());
      const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
      if (!accepted.includes(ext) && !accepted.includes(file.type.toLowerCase())) {
        onRejected(`That file type isn't accepted. Allowed: ${accept}`);
        return;
      }
      if (file.size > maxSizeBytes) {
        const limitMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
        onRejected(`That file is too large. The maximum size is ${limitMb} MB.`);
        return;
      }
      onFileSelect(file);
    },
    [accept, maxSizeBytes, onFileSelect, onRejected],
  );

  // Busy / terminal states replace the drop zone entirely.
  if (state !== "idle") {
    return (
      <div
        className={cn(
          "rounded-md border border-edge bg-surface-raised p-6 text-center",
          className,
        )}
      >
        {state === "uploading" && (
          <div role="status">
            <Spinner className="mx-auto mb-2 h-7 w-7 text-brand" />
            <p className="text-sm font-medium text-content">Uploading… {progress}%</p>
            <div
              className="mx-auto mt-3 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-sunken"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            >
              <div
                className="h-full rounded-full bg-brand motion-safe:transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {state === "processing" && (
          <div role="status">
            <Spinner className="mx-auto mb-2 h-7 w-7 text-processing" />
            <p className="text-sm font-medium text-content">Extracting text…</p>
            <p className="mt-1 text-xs text-content-muted">
              This usually takes a few seconds.
            </p>
          </div>
        )}

        {state === "ready" && (
          <div role="status">
            <CheckCircle2
              className="mx-auto mb-2 h-7 w-7 text-success"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-content">Ready</p>
            {selectedFile && (
              <p className="mt-1 break-words text-xs text-content-muted">
                {selectedFile.name}
              </p>
            )}
            <Button variant="ghost" size="sm" className="mt-3" onClick={onReset}>
              Choose a different file
            </Button>
          </div>
        )}

        {state === "failed" && (
          <div role="alert">
            <XCircle className="mx-auto mb-2 h-7 w-7 text-danger" aria-hidden="true" />
            <p className="text-sm font-medium text-content">Upload failed</p>
            <p className="mt-1 text-xs text-content-muted">
              Something went wrong while uploading or processing the file.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onReset}>
              Try again
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) validateAndSelect(file);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-8 text-center",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          "disabled:cursor-not-allowed disabled:opacity-60 motion-safe:transition-colors",
          dragOver
            ? "border-brand bg-brand-subtle"
            : "border-edge-strong bg-surface-raised hover:border-content-muted",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) validateAndSelect(file);
            // Allow re-selecting the same file after a reset.
            e.target.value = "";
          }}
        />

        {selectedFile ? (
          <>
            <FileText className="mb-2 h-8 w-8 text-brand" aria-hidden="true" />
            <span className="break-words text-sm font-medium text-content">
              {selectedFile.name}
            </span>
            <span className="mt-1 text-xs text-content-muted">
              {formatFileSize(selectedFile.size)} · choose another
            </span>
          </>
        ) : (
          <>
            <Upload className="mb-2 h-8 w-8 text-content-muted" aria-hidden="true" />
            <span className="text-sm font-medium text-content">
              Choose a file or drag it here
            </span>
            <span className="mt-1 text-xs text-content-muted">
              {accept.split(",").join(", ")} · up to{" "}
              {(maxSizeBytes / (1024 * 1024)).toFixed(0)} MB
            </span>
          </>
        )}
      </button>

      {selectedFile && (
        <Button block className="mt-4" onClick={onUpload} disabled={disabled}>
          <Upload className="h-4 w-4" />
          Upload file
        </Button>
      )}
    </div>
  );
}
