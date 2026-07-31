import { uploadPatientDocumentAction } from "@/app/actions/patient-document-actions";

export const PATIENT_DOCUMENT_CATEGORIES = [
  "medical_history",
  "insurance",
  "report",
  "lab_report",
  "radiology_report",
  "prescription",
  "bill",
  "id_proof",
  "consent",
  "discharge",
  "other",
] as const;

export type PatientDocumentCategory = (typeof PATIENT_DOCUMENT_CATEGORIES)[number];

export function pdfBytesToDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return `data:application/pdf;base64,${base64}`;
}

export async function savePdfAsPatientDocument(
  patientId: string,
  category: PatientDocumentCategory,
  fileName: string,
  bytes: Uint8Array,
  opts?: { visitId?: string; label?: string },
): Promise<{ id: string } | undefined> {
  const res = await uploadPatientDocumentAction({
    patientId,
    visitId: opts?.visitId,
    category,
    label: opts?.label,
    fileName,
    mimeType: "application/pdf",
    size: bytes.length,
    fileDataUrl: pdfBytesToDataUrl(bytes),
  });
  if (!res.ok) {
    console.error("[patient-documents] Failed to save PDF:", res.error);
    return undefined;
  }
  return res.data;
}
