/** Nurse module — treatment execution, vitals, clinical consent */

import type { BillingHandoffPayload } from "@/design-system/counsellor-data";
import type { ConsultationRecord } from "@/design-system/doctor-data";
import type { TreatmentPath } from "@/design-system/frontdesk-data";

export type ConsentStatus =
  | "draft"
  | "presented"
  | "signed"
  | "uploaded"
  | "verified"
  | "locked"
  | "declined";

export type SignerRole = "patient" | "guardian" | "witness";

export type ConsentCaptureMode = "canvas" | "upload" | "remote_pending";

export type ConsentTemplate = {
  id: string;
  label: string;
  version: string;
  treatmentTypes: string[];
  packageIds: string[];
  treatmentPaths: TreatmentPath[];
  required: boolean;
  body: string;
  risks: string[];
  language: "en" | "hi" | "bilingual";
};

export type ConsentRecord = {
  id: string;
  templateId: string;
  templateVersion: string;
  visitId: string;
  patientId: string;
  label: string;
  status: ConsentStatus;
  required: boolean;
  captureMode?: ConsentCaptureMode;
  signerRole?: SignerRole;
  signerName?: string;
  signedAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  uploadFileName?: string;
  uploadDataUrl?: string;
  signatureDataUrl?: string;
  witnessName?: string;
  language: string;
  declinedReason?: string;
};

export type VitalsRecord = {
  visitId: string;
  bpSystolic: number;
  bpDiastolic: number;
  pulse: number;
  spo2: number;
  temperature: number;
  weight?: number;
  painScore: number;
  allergies: string;
  redFlags: string;
  nursingNotes: string;
  recordedAt: string;
  recordedBy: string;
};

export type TreatmentSession = {
  id: string;
  visitId: string;
  sessionNumber: number;
  totalSessions: number;
  procedure: string;
  bay?: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  startedAt?: string;
  completedAt?: string;
  notes?: string;
};

export type NurseTaskStatus = "pending" | "in_progress" | "completed";

export type NurseTask = {
  id: string;
  visitId: string;
  title: string;
  status: NurseTaskStatus;
  assignedBy: string;
  assignedAt: string;
  completedAt?: string;
  notes?: string;
};

export type DischargeSummary = {
  admissionDate: string;
  dischargeDate: string;
  diagnosis: string;
  procedures: string;
  medications: string;
  followUp: string;
  notes: string;
  preparedBy: string;
  preparedAt: string;
};

export type NursingEpisode = {
  id: string;
  visitId: string;
  patientId: string;
  nurseId: string;
  nurseName: string;
  branchId: string;
  treatmentPath: TreatmentPath;
  packageLabel: string;
  packageId: string;
  doctorName: string;
  doctorId: string;
  billingStatus: string;
  balanceDue?: number;
  status: "queued" | "vitals" | "consent" | "ready" | "in_treatment" | "completed";
  priority: "normal" | "high";
  queuedAt: string;
  vitals?: VitalsRecord;
  consents: ConsentRecord[];
  sessions: TreatmentSession[];
  internalNotes: string;
  tasks: NurseTask[];
  dischargeSummary?: DischargeSummary;
  completedAt?: string;
};

export type NursingHandoffPayload = {
  visitId: string;
  patientId: string;
  patientName: string;
  uhid: string;
  doctorId: string;
  doctorName: string;
  treatmentPath: TreatmentPath;
  packageId: string;
  packageLabel: string;
  billingStatus: string;
  amountPaid: number;
  balanceDue?: number;
  netAmount: number;
  commercialConsent: boolean;
  billingHandoff?: BillingHandoffPayload;
  consultation?: ConsultationRecord;
  ipdWard?: string;
  ipdBed?: string;
  sentAt: string;
};

export const DEMO_NURSE_ID = "nurse_1";
export const DEMO_NURSE_NAME = "Anita Desai";

export const CONSENT_TEMPLATES: ConsentTemplate[] = [
  {
    id: "consent_general_treatment",
    label: "General treatment consent",
    version: "2026.1",
    treatmentTypes: ["general"],
    packageIds: ["pkg_opd", "pkg_basic", "pkg_regen", "pkg_wellness"],
    treatmentPaths: ["opd", "ipd", "daycare"],
    required: true,
    language: "bilingual",
    body: "I consent to receive the treatment plan recommended by my consulting physician at Navayu Spine & Wellness. I understand the nature of MSK/wellness interventions, expected benefits, and that results may vary.",
    risks: ["Temporary soreness", "Allergic reaction to materials", "Need for treatment modification"],
  },
  {
    id: "consent_physio",
    label: "Physiotherapy & exercise consent",
    version: "2026.1",
    treatmentTypes: ["physio"],
    packageIds: ["pkg_basic", "pkg_regen"],
    treatmentPaths: ["opd", "daycare"],
    required: true,
    language: "en",
    body: "I consent to physiotherapy, therapeutic exercise, and manual therapy as prescribed. I will inform staff of pain increase or neurological symptoms immediately.",
    risks: ["Muscle soreness", "Temporary pain flare", "Dizziness during exercises"],
  },
  {
    id: "consent_injection",
    label: "Injection / procedure consent",
    version: "2026.1",
    treatmentTypes: ["injection"],
    packageIds: ["pkg_regen"],
    treatmentPaths: ["opd", "daycare"],
    required: false,
    language: "en",
    body: "I consent to image-guided or clinical injections/procedures as explained. Alternatives including conservative care have been discussed.",
    risks: ["Infection", "Bleeding", "Nerve irritation", "No guarantee of outcome"],
  },
  {
    id: "consent_ipd_admission",
    label: "IPD admission & ward care consent",
    version: "2026.1",
    treatmentTypes: ["ipd"],
    packageIds: ["pkg_regen", "pkg_basic", "pkg_wellness"],
    treatmentPaths: ["ipd"],
    required: true,
    language: "bilingual",
    body: "I consent to inpatient/daycare admission, ward nursing care, monitoring, and treatments as ordered by the attending physician during my stay.",
    risks: ["Hospital-acquired infection", "Fall risk", "Medication reactions", "Transfer to higher care if needed"],
  },
  {
    id: "consent_data_photo",
    label: "Clinical photography & records",
    version: "2026.1",
    treatmentTypes: ["general"],
    packageIds: ["pkg_opd", "pkg_basic", "pkg_regen", "pkg_wellness"],
    treatmentPaths: ["opd", "ipd", "daycare"],
    required: false,
    language: "en",
    body: "I consent to clinical photography and secure storage of treatment records for continuity of care and quality audit.",
    risks: ["Images stored in secure EMR only"],
  },
];

export const TREATMENT_BAYS = [
  { id: "bay_physio_1", label: "Physio Bay 1" },
  { id: "bay_physio_2", label: "Physio Bay 2" },
  { id: "bay_procedure", label: "Procedure Room" },
  { id: "bay_wellness", label: "Wellness Studio" },
];

export function templatesForHandoff(handoff: NursingHandoffPayload): ConsentTemplate[] {
  const pkg = handoff.packageId;
  const path = handoff.treatmentPath;
  const hasInjection =
    handoff.billingHandoff?.quote?.lineItems?.some((l) => /injection|regenerative/i.test(l.label)) ??
    handoff.packageId === "pkg_regen";

  return CONSENT_TEMPLATES.filter((t) => {
    if (!t.treatmentPaths.includes(path)) return false;
    if (!t.packageIds.includes(pkg)) return false;
    if (t.id === "consent_injection" && !hasInjection) return false;
    return true;
  });
}

export function requiredConsentsComplete(consents: ConsentRecord[]) {
  const required = consents.filter((c) => c.required);
  return required.length > 0 && required.every((c) => c.status === "verified" || c.status === "locked");
}

export function consentProgress(consents: ConsentRecord[]) {
  const required = consents.filter((c) => c.required);
  const done = required.filter((c) => ["verified", "locked", "signed", "uploaded"].includes(c.status));
  return { done: done.length, total: required.length };
}

export function sessionCountForPackage(packageId: string) {
  const map: Record<string, number> = {
    pkg_opd: 1,
    pkg_basic: 6,
    pkg_regen: 12,
    pkg_wellness: 8,
  };
  return map[packageId] ?? 6;
}

export function queueWaitMinutes(sentAt: string) {
  return Math.max(0, Math.round((Date.now() - new Date(sentAt).getTime()) / 60000));
}
