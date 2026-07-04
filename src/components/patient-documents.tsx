"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, AttioButton } from "@/components/frontdesk/ui";
import {
  listPatientDocumentsAction,
  uploadPatientDocumentAction,
  deletePatientDocumentAction,
  type PatientDocumentListItem,
  PATIENT_DOCUMENT_CATEGORIES,
} from "@/app/actions/patient-document-actions";
import { FileText, Upload, Trash2, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatFileSize(bytes: number | null) {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(category: string) {
  return category
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function PatientDocumentsPanel({ patientId, visitId }: { patientId: string; visitId?: string }) {
  const [documents, setDocuments] = useState<PatientDocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<string>("medical_history");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listPatientDocumentsAction(patientId);
    if (res.ok) setDocuments(res.data);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > 5 * 1024 * 1024) {
      setError("File size must be under 5 MB.");
      setFile(null);
      return;
    }
    setError(null);
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await uploadPatientDocumentAction({
        patientId,
        visitId,
        category,
        label: label || undefined,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        fileDataUrl: dataUrl,
      });
      if (!res.ok) {
        setError(res.error ?? "Upload failed");
      } else {
        setFile(null);
        setLabel("");
        setCategory("medical_history");
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    const res = await deletePatientDocumentAction(id);
    if (!res.ok) {
      setError(res.error ?? "Delete failed");
    } else {
      await load();
    }
  };

  const grouped = documents.reduce<Record<string, PatientDocumentListItem[]>>((acc, doc) => {
    acc[doc.category] = acc[doc.category] ?? [];
    acc[doc.category].push(doc);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Panel title="Upload document">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[12px]">Category</Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PATIENT_DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {categoryLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[12px]">Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Insurance card front"
              className="h-8 text-[13px]"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[12px]">File</Label>
            <Input type="file" onChange={handleFileChange} className="h-9 text-[13px]" />
            {file && (
              <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                {file.name} · {formatFileSize(file.size)}
              </p>
            )}
          </div>
        </div>
        {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
        <div className="mt-3 flex justify-end">
          <AttioButton onClick={handleUpload} disabled={!file || uploading} className="gap-1.5">
            <Upload className="size-3.5" />
            {uploading ? "Uploading..." : "Upload"}
          </AttioButton>
        </div>
      </Panel>

      <Panel title="Documents">
        {loading ? (
          <p className="py-4 text-center text-[13px] text-[var(--attio-text-tertiary)]">Loading...</p>
        ) : documents.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--attio-text-tertiary)]">
            No documents uploaded yet.
          </p>
        ) : (
          <div className="space-y-4">
            {PATIENT_DOCUMENT_CATEGORIES.map((cat) => {
              const docs = grouped[cat];
              if (!docs || docs.length === 0) return null;
              return (
                <div key={cat}>
                  <h4 className="mb-2 text-[12px] font-medium text-[var(--attio-text-tertiary)]">
                    {categoryLabel(cat)}
                  </h4>
                  <ul className="space-y-2">
                    {docs.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between rounded-lg border border-[var(--attio-border-subtle)] bg-[var(--attio-surface)] p-3"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText className="size-4 shrink-0 text-[var(--attio-accent)]" />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium">{doc.label || doc.fileName}</p>
                            <p className="text-[11px] text-[var(--attio-text-tertiary)]">
                              {doc.fileName} · {formatFileSize(doc.size)} · {new Date(doc.uploadedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={`/api/patient-documents/${doc.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--attio-border)] bg-white px-2 text-[12px] font-medium hover:bg-[var(--attio-surface)]"
                          >
                            View
                          </a>
                          <AttioButton
                            variant="ghost"
                            className="h-7 w-7 px-0"
                            onClick={() => handleDelete(doc.id)}
                            title="Delete"
                          >
                            <Trash2 className="size-3.5 text-red-600" />
                          </AttioButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
