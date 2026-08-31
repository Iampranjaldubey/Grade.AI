import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileText, Trash2, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import { uploadsApi, getErrorMessage } from "@/lib/api";
import { formatFileSize } from "@/lib/utils";
import { DocumentUploadZone } from "@/components/DocumentUploadZone";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  ConfirmDialog,
  Skeleton,
  StatusBadge,
} from "@/components/ui";
import type { DocumentOut, DocumentType } from "@/types";

interface DocumentSectionProps {
  title: string;
  description?: string;
  docType: DocumentType;
  documents: DocumentOut[];
  courseId: string;
  assignmentId?: string;
  isLoading?: boolean;
  accept?: string;
  /** Called after a successful upload or delete so the owner can refetch. */
  onChanged: () => void;
}

/**
 * Upload + list + delete for one category of course/assignment material.
 *
 * Consolidates the near-identical document sections that were duplicated across
 * the course and assignment detail pages, and replaces the native
 * `window.confirm()` delete prompt with an accessible confirmation dialog.
 */
export function DocumentSection({
  title,
  description,
  docType,
  documents,
  courseId,
  assignmentId,
  isLoading = false,
  accept,
  onChanged,
}: DocumentSectionProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DocumentOut | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) => uploadsApi.deleteDocument(documentId),
    onSuccess: () => {
      toast.success("Document deleted");
      setPendingDelete(null);
      onChanged();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, "Failed to delete document"));
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <Button
          variant={showUpload ? "ghost" : "outline"}
          size="sm"
          onClick={() => setShowUpload((v) => !v)}
        >
          {showUpload ? (
            <>
              <X className="h-4 w-4" />
              Cancel
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Upload
            </>
          )}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {showUpload && (
          <DocumentUploadZone
            {...(accept ? { accept } : {})}
            docType={docType}
            courseId={courseId}
            assignmentId={assignmentId}
            onSuccess={() => {
              setShowUpload(false);
              onChanged();
            }}
            onError={() => onChanged()}
          />
        )}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : documents.length === 0 ? (
          <p className="py-2 text-sm text-content-muted">
            No documents uploaded yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-md border border-edge-subtle bg-surface-raised px-3 py-2.5"
              >
                <FileText
                  className="h-5 w-5 flex-shrink-0 text-content-muted"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content">
                    {doc.file_name}
                  </p>
                  <p className="text-xs text-content-muted">
                    {formatFileSize(doc.file_size_bytes)}
                  </p>
                </div>
                <StatusBadge kind="parse" value={doc.parse_status} />
                <button
                  type="button"
                  onClick={() => setPendingDelete(doc)}
                  aria-label={`Delete ${doc.file_name}`}
                  className="rounded-md p-2 text-content-muted hover:bg-danger-subtle hover:text-danger-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-safe:transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this document?"
        description={
          pendingDelete
            ? `"${pendingDelete.file_name}" will be permanently removed, along with any text extracted from it for AI grading.`
            : undefined
        }
        confirmLabel="Delete"
        tone="danger"
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
        }}
      />
    </Card>
  );
}
