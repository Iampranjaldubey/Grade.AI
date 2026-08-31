import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { uploadsApi, getErrorMessage } from "@/lib/api";
import { FileUploader, type FileUploaderState } from "@/components/ui";
import type { DocumentType } from "@/types";

// Default client-side upload cap. Mirrors the backend MAX_UPLOAD_SIZE_BYTES
// default (25 MiB) so oversized files are rejected before the network round-trip.
const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;
const POLL_INTERVAL_MS = 2000;

interface DocumentUploadZoneProps {
  accept?: string;
  docType: DocumentType;
  courseId: string;
  assignmentId?: string;
  maxSizeBytes?: number;
  onSuccess?: (documentId: string, fileKey: string, fileSizeBytes: number) => void;
  onError?: (error: Error) => void;
}

/**
 * Orchestrates the upload pipeline: presign → PUT to storage → confirm →
 * poll until the document has been parsed.
 *
 * The pipeline is unchanged; presentation now lives in the accessible
 * `FileUploader` primitive (the previous markup was a non-focusable `div` and
 * hard-coded its own blue palette).
 */
export function DocumentUploadZone({
  accept = ".pdf,.docx,.txt",
  docType,
  courseId,
  assignmentId,
  maxSizeBytes = DEFAULT_MAX_UPLOAD_SIZE_BYTES,
  onSuccess,
  onError,
}: DocumentUploadZoneProps) {
  const [state, setState] = useState<FileUploaderState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const pollRef = useRef<number | null>(null);

  // Never leave a poll running after unmount.
  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    [],
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setState("idle");
    setSelectedFile(null);
    setProgress(0);
  }, [stopPolling]);

  const pollStatus = useCallback(
    async (documentId: string, fileKey: string, fileSizeBytes: number) => {
      try {
        const status = await uploadsApi.getStatus(documentId);

        if (status.parse_status === "success") {
          stopPolling();
          setState("ready");
          setProgress(100);
          toast.success("Document processed");
          onSuccess?.(documentId, fileKey, fileSizeBytes);
        } else if (status.parse_status === "failed") {
          stopPolling();
          setState("failed");
          const error = new Error("Document processing failed");
          toast.error("Document processing failed");
          onError?.(error);
        }
        // Otherwise it's still pending/processing — keep polling.
      } catch (error) {
        console.error("Error polling document status:", error);
      }
    },
    [onError, onSuccess, stopPolling],
  );

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setState("uploading");
      setProgress(0);

      // 1. Ask the API where to put the file.
      const presign = await uploadsApi.presign({
        file_name: selectedFile.name,
        content_type: selectedFile.type || "application/octet-stream",
        doc_type: docType,
        course_id: courseId,
        assignment_id: assignmentId,
      });

      // 2. Upload straight to storage, tracking progress.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            // Reserve the last 10% for server-side processing.
            setProgress(Math.round((e.loaded / e.total) * 90));
          }
        });
        xhr.addEventListener("load", () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed with status ${xhr.status}`)),
        );
        xhr.addEventListener("error", () => reject(new Error("Upload failed")));

        xhr.open("PUT", presign.upload_url);
        xhr.setRequestHeader(
          "Content-Type",
          selectedFile.type || "application/octet-stream",
        );
        xhr.send(selectedFile);
      });

      setProgress(95);

      // 3. Tell the API the upload landed.
      const document = await uploadsApi.confirm({
        file_key: presign.file_key,
        file_name: selectedFile.name,
        file_size_bytes: selectedFile.size,
        doc_type: docType,
        course_id: courseId,
        assignment_id: assignmentId,
      });

      // 4. Poll until parsing finishes. Values are captured locally to avoid a
      //    stale closure over component state.
      const fileKey = presign.file_key;
      const fileSizeBytes = selectedFile.size;
      setState("processing");
      pollRef.current = window.setInterval(
        () => pollStatus(document.id, fileKey, fileSizeBytes),
        POLL_INTERVAL_MS,
      );
    } catch (error) {
      console.error("Upload error:", error);
      setState("failed");
      const message = getErrorMessage(error, "Upload failed");
      toast.error(message);
      onError?.(error instanceof Error ? error : new Error(message));
    }
  };

  return (
    <FileUploader
      accept={accept}
      maxSizeBytes={maxSizeBytes}
      state={state}
      progress={progress}
      selectedFile={selectedFile}
      onFileSelect={(file) => {
        setSelectedFile(file);
        setState("idle");
        setProgress(0);
      }}
      onUpload={handleUpload}
      onReset={reset}
      onRejected={(message) => toast.error(message)}
    />
  );
}
