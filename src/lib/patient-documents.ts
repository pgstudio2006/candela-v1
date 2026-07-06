export const PATIENT_DOCUMENT_CATEGORIES = [
  "medical_history",
  "insurance",
  "report",
  "id_proof",
  "consent",
  "discharge",
  "other",
] as const;

export type PatientDocumentCategory = (typeof PATIENT_DOCUMENT_CATEGORIES)[number];
