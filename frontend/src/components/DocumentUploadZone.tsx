import { useState, useCallback, useRef } from "react";
import { Upload, FileText, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { uploadsApi } from "@/lib/api";
import type { DocumentType } from "@/types";
import toast from "react-hot-toast";

type UploadState = "idle" | "uploading" | "processing" | "ready" | "failed";

interface DocumentUploadZoneProps {
  accept?: string;
  docType: DocumentType;
  courseId: string;
  assignmentId?: string;
  onSuccess?: (documentId: string) => void;
  onError?: (error: Error) => void;
}

export function DocumentUploadZone({
  accept = ".pdf,.docx,.txt",
  docType,
  courseId,
  assignmentId,
  onSuccess,
  onError,
}: DocumentUploadZoneProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [, setDocumentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<number | null>(null);

  const handleFileSelect = useCallback((file: File) => {
    // Validate file type
    const acceptedTypes = accept.split(",").map((t) => t.trim());
    const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;
    const isAccepted = acceptedTypes.includes(fileExt) || acceptedTypes.includes(file.type);

    if (!isAccepted) {
      toast.error(`Invalid file type. Accepted: ${accept}`);
      return;
    }

    setSelectedFile(file);
    setState("idle");
    setProgress(0);
  }, [accept]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const pollDocumentStatus = useCallback(
    async (docId: string) => {
      try {
        const status = await uploadsApi.getStatus(docId);

        if (status.parse_status === "success") {
          setState("ready");
          setProgress(100);
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          toast.success("Document processed successfully!");
          onSuccess?.(docId);
        } else if (status.parse_status === "failed") {
          setState("failed");
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          const error = new Error("Document processing failed");
          toast.error("Document processing failed");
          onError?.(error);
        }
        // Continue polling if still pending or processing
      } catch (error) {
        console.error("Error polling document status:", error);
      }
    },
    [onSuccess, onError]
  );

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setState("uploading");
      setProgress(0);

      // Step 1: Get presigned URL
      const presignResponse = await uploadsApi.presign({
        file_name: selectedFile.name,
        content_type: selectedFile.type || "application/octet-stream",
        doc_type: docType,
        course_id: courseId,
        assignment_id: assignmentId,
      });

      // Step 2: Upload file to S3/MinIO with progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 90); // Reserve 10% for processing
            setProgress(percentComplete);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Upload failed"));
        });

        xhr.open("PUT", presignResponse.upload_url);
        xhr.setRequestHeader("Content-Type", selectedFile.type || "application/octet-stream");
        xhr.send(selectedFile);
      });

      setProgress(95);

      // Step 3: Confirm upload
      const document = await uploadsApi.confirm({
        file_key: presignResponse.file_key,
        file_name: selectedFile.name,
        file_size_bytes: selectedFile.size,
        doc_type: docType,
        course_id: courseId,
        assignment_id: assignmentId,
      });

      setDocumentId(document.id);
      setState("processing");
      setProgress(95);

      // Step 4: Poll for processing status
      pollIntervalRef.current = window.setInterval(() => {
        pollDocumentStatus(document.id);
      }, 2000);
    } catch (error) {
      console.error("Upload error:", error);
      setState("failed");
      const err = error instanceof Error ? error : new Error("Upload failed");
      toast.error(err.message);
      onError?.(err);
    }
  };

  const reset = () => {
    setState("idle");
    setSelectedFile(null);
    setProgress(0);
    setDocumentId(null);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStateDisplay = () => {
    switch (state) {
      case "uploading":
        return (
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">Uploading... {progress}%</p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        );
      case "processing":
        return (
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">Processing text...</p>
            <p className="text-xs text-gray-500 mt-1">This may take a moment</p>
          </div>
        );
      case "ready":
        return (
          <div className="text-center">
            <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-green-700">Ready ✓</p>
            <p className="text-xs text-gray-500 mt-1">{selectedFile?.name}</p>
            <button
              onClick={reset}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Upload another
            </button>
          </div>
        );
      case "failed":
        return (
          <div className="text-center">
            <XCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-red-700">Failed ✗</p>
            <p className="text-xs text-gray-500 mt-1">Upload or processing failed</p>
            <button
              onClick={reset}
              className="mt-3 text-sm text-blue-600 hover:text-blue-700 underline"
            >
              Try again
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  if (state === "uploading" || state === "processing" || state === "ready" || state === "failed") {
    return (
      <div className="border-2 border-gray-200 rounded-lg p-6 bg-white">
        {getStateDisplay()}
      </div>
    );
  }

  return (
    <div>
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          ${
            dragOver
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400 bg-gray-50"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
        />

        <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />

        {selectedFile ? (
          <div>
            <FileText className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
            <p className="text-xs text-gray-500 mt-1">{formatFileSize(selectedFile.size)}</p>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700 mb-1">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-gray-500">
              {accept.split(",").join(", ").toUpperCase()}
            </p>
          </>
        )}
      </div>

      {selectedFile && state === "idle" && (
        <button
          onClick={handleUpload}
          className="mt-4 w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Upload File
        </button>
      )}
    </div>
  );
}
