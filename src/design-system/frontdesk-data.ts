/** Front Desk mock data — UI phase */

export type BillingStatus = "paid" | "deferred" | "pending" | "partial";
export type ExamStatus = "not_started" | "in_progress" | "done";
export type VisitStage =
  | "registered"
  | "checked_in"
  | "billing"
  | "queued"
  | "junior_exam"
  | "with_doctor"
  | "awaiting_counsellor"
  | "ipd_admitted"
  | "nursing_queue"
  | "nursing_active"
  | "completed";

export type TreatmentPath = "opd" | "ipd" | "daycare";

export type Patient = {
  id: string;
  uhid: string;
  name: string;
  phone: string;
  email?: string;
  age: number;
  gender: "M" | "F" | "O";
  department: string;
  departmentId: string;
  tags: string[];
  balance: number;
  lastVisit?: string;
  referrer?: string;
  referrerSource?: string;
  corporateId?: string;
  referralDoctorId?: string;
  referralDoctorName?: string;
  registrationNotes?: string;
  consentTreatment?: boolean;
  consentData?: boolean;
};

export type Visit = {
  id: string;
  patientId: string;
  token?: number;
  stage: VisitStage;
  departmentId: string;
  doctorId: string;
  doctorName: string;
  billing: BillingStatus;
  exam: ExamStatus;
  appointment: boolean;
  appointmentTime?: string;
  waitMin: number;
  checkInAt?: string;
  billAmount?: number;
  amountPaid?: number;
  balanceDue?: number;
  treatmentPath?: TreatmentPath;
  ipdAdmissionId?: string;
  counselPackageLabel?: string;
  deferredReason?: string;
  routingNote?: string;
  notes?: string;
};

export const APPOINTMENT_SLOTS = {
  dept_spine: { durationMin: 20, bufferMin: 5 },
  dept_wellness: { durationMin: 30, bufferMin: 10 },
};

export const PATIENTS: Patient[] = [];

export const VISITS: Visit[] = [];

export const DASHBOARD_KPIS = [
  { label: "Arrivals today", value: "—", delta: "Live from OPD", trend: "neutral" as const },
  { label: "Checked in", value: "—", delta: "Live from OPD", trend: "neutral" as const },
  { label: "Billed (paid)", value: "—", delta: "Live from billing", trend: "neutral" as const },
  { label: "In queue", value: "—", delta: "Live from queue", trend: "neutral" as const },
  { label: "Junior exam", value: "—", delta: "Live from nursing", trend: "neutral" as const },
  { label: "With doctor", value: "—", delta: "Live from doctor", trend: "neutral" as const },
];

export const ACTION_ITEMS: { id: string; priority: string; text: string; action: string; href: string }[] = [];

export const TODAY_TIMELINE: { time: string; type: string; patient: string; doctor: string; status: string }[] = [];

export const DOCTOR_LOAD: { id: string; name: string; dept: string; queue: number; avgWait: number; nextAvailable: string }[] = [];

export const BILLING_TEMPLATES = [
  { id: "bt1", label: "Spine OPD Consult", amount: 1500, dept: "dept_spine" },
  { id: "bt2", label: "Wellness OPD Consult", amount: 2000, dept: "dept_wellness" },
  { id: "bt3", label: "X-Ray Package", amount: 2500, dept: "dept_spine" },
  { id: "bt4", label: "Physio Session (single)", amount: 800, dept: "dept_spine" },
];

export const CHECKIN_WAITING: { patientId: string; appointmentTime?: string; doctor: string; type: "appointment" | "walk-in" }[] = [];

export function getPatient(id: string) {
  return PATIENTS.find((p) => p.id === id);
}

export function getVisit(id: string) {
  return VISITS.find((v) => v.id === id);
}

export function getPatientVisits(patientId: string) {
  return VISITS.filter((v) => v.patientId === patientId);
}

export function visitsByDoctor(doctorId: string) {
  return VISITS.filter((v) => v.doctorId === doctorId && ["queued", "junior_exam"].includes(v.stage));
}
