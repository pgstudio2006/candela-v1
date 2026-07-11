import type { IpdAdmissionStatus } from "@/design-system/ipd-data";

/** Doctor module — seed data & types */

export type TreatmentMode = "opd" | "ipd" | "daycare";

export const PRESCRIPTION_FREQUENCY_OPTIONS = [
  { value: "OD", label: "Once a day" },
  { value: "BD", label: "Twice a day" },
  { value: "TDS", label: "Thrice a day" },
  { value: "QID", label: "Four times a day" },
  { value: "HS", label: "At bedtime" },
  { value: "SOS", label: "As needed" },
  { value: "STAT", label: "Immediately" },
  { value: "weekly", label: "Once a week" },
];

export type PrescriptionLine = {
  id: string;
  drug: string;
  dose: string;
  frequency: string;
  days: number;
  duration?: string;
  instructions?: string;
};

export type ConsultationRecord = {
  visitId: string;
  patientId: string;
  doctorId: string;
  startedAt: string;
  completedAt?: string;
  status: "draft" | "in_progress" | "completed";
  treatmentMode: TreatmentMode;
  recommendCounsellor: boolean;
  skipCounsellor: boolean;
  packageId?: string;
  counsellorNotes?: string;
  doctorAdvice?: string;
  whatsappRxSent: boolean;
  examination: Record<string, string | number | boolean>;
  diagnosis: Record<string, string | number | boolean>;
  treatment: Record<string, string | number | boolean>;
  prescription: PrescriptionLine[];
  notes: string;
  scribeTranscript?: string;
  scribeLanguage?: string;
  scribeAppliedAt?: string;
  templateId?: string;
  handoff?: Record<string, string | number | boolean>;
};

export type DoctorProfile = {
  doctorId: string;
  staffId: string;
  name: string;
  email: string;
  departmentIds: string[];
  departmentLabels: string[];
  licenseNo?: string;
};

export type CounsellorQueueItem = {
  id: string;
  visitId: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  sentAt: string;
  treatmentMode: TreatmentMode;
  packageId?: string;
  packageLabel?: string;
  priority: "normal" | "high";
  payload: ConsultationRecord;
};

export type IpdPatient = {
  id: string;
  visitId?: string;
  patientId: string;
  ward: string;
  bed: string;
  category?: string;
  patientType?: string;
  billingMode?: string;
  expectedDischarge?: string;
  admittedAt: string;
  diagnosis: string;
  attendingDoctorId: string;
  lastRoundAt?: string;
  lastRoundNote?: string;
  status: IpdAdmissionStatus;
};

export type DoctorTemplate = {
  id: string;
  label: string;
  doctorId: string;
  disease: string;
  diagnosis: Record<string, string | number | boolean>;
  treatment: Record<string, string | number | boolean>;
  prescription: PrescriptionLine[];
};

export type CarePackage = {
  id: string;
  label: string;
  amount: number;
  sessions: number;
  dept: string;
};

export const CARE_PACKAGES: CarePackage[] = [
  { id: "pkg_regen", label: "Advanced Regenerative — 12 sessions", amount: 85000, sessions: 12, dept: "dept_spine" },
  { id: "pkg_basic", label: "Basic MSK Care — 6 sessions", amount: 32000, sessions: 6, dept: "dept_spine" },
  { id: "pkg_wellness", label: "Metabolic Reset — 8 sessions", amount: 45000, sessions: 8, dept: "dept_wellness" },
  { id: "pkg_opd", label: "OPD follow-up only", amount: 1500, sessions: 1, dept: "dept_spine" },
];

export const DOCTOR_TEMPLATES: DoctorTemplate[] = [
  {
    id: "tpl_lumbar",
    label: "Lumbar radiculopathy — conservative",
    doctorId: "dr_1",
    disease: "Lumbar disc disease",
    diagnosis: {
      primaryDiagnosis: "Lumbar disc disease with radiculopathy",
      icdTag: "M51.1",
      severity: "moderate",
    },
    treatment: {
      plan: "Conservative MSK protocol — physiotherapy, activity modification",
      followUp: "2 weeks",
      procedures: "None",
    },
    prescription: [
      { id: "rx1", drug: "Tab. Pregabalin 75mg", dose: "1 tab", frequency: "OD", days: 14 },
      { id: "rx2", drug: "Tab. Etoricoxib 60mg", dose: "1 tab", frequency: "OD", days: 5 },
    ],
  },
  {
    id: "tpl_cervical",
    label: "Cervical spondylosis — MSK",
    doctorId: "dr_1",
    disease: "Cervical spondylosis",
    diagnosis: {
      primaryDiagnosis: "Cervical spondylosis with myofascial pain",
      icdTag: "M47.8",
      severity: "mild",
    },
    treatment: {
      plan: "Cervical stabilization exercises, ergonomic counselling",
      followUp: "3 weeks",
      procedures: "None",
    },
    prescription: [
      { id: "rx1", drug: "Tab. Thiocolchicoside 4mg", dose: "1 tab", frequency: "BD", days: 7 },
    ],
  },
  {
    id: "tpl_wellness",
    label: "Metabolic syndrome — wellness",
    doctorId: "dr_3",
    disease: "Metabolic syndrome",
    diagnosis: {
      primaryDiagnosis: "Metabolic syndrome — lifestyle disorder",
      icdTag: "E88.81",
      severity: "moderate",
    },
    treatment: {
      plan: "Diet protocol A, structured exercise, metabolic monitoring",
      followUp: "4 weeks",
      procedures: "Body composition analysis",
    },
    prescription: [],
  },
];

export const IPD_PATIENTS: IpdPatient[] = [];

export const DOCTOR_SCHEDULE_BLOCKS: { doctorId: string; date: string; slots: string[] }[] = [];

export const SCRIBE_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi" },
  { id: "hinglish", label: "Hinglish" },
  { id: "pa", label: "Punjabi" },
  { id: "mr", label: "Marathi" },
  { id: "bn", label: "Bengali" },
  { id: "gu", label: "Gujarati" },
  { id: "ta", label: "Tamil" },
  { id: "te", label: "Telugu" },
  { id: "kn", label: "Kannada" },
  { id: "ml", label: "Malayalam" },
  { id: "ur", label: "Urdu" },
] as const;

export const DEMO_DOCTOR_ID = "dr_1";
