import type { BillingStatus, ExamStatus, Patient, Visit, VisitStage } from "@/design-system/frontdesk-data";
import { BILLING_TEMPLATES } from "@/design-system/frontdesk-data";
import { DEPARTMENTS, DOCTORS_BY_DEPT } from "@/design-system/mock-data";
import { parsePatientRegistrationMeta } from "@/lib/registration-meta";

export const DOCTOR_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(DOCTORS_BY_DEPT)
    .flat()
    .map((d) => [d.id, d.name]),
);

export const DEPT_LABELS: Record<string, string> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, d.label]),
);

export function doctorName(id: string) {
  return DOCTOR_NAMES[id] ?? id;
}

export function deptLabel(id: string) {
  return DEPT_LABELS[id] ?? id;
}

export function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Minutes since check-in — supports HH:mm (today) or ISO timestamps. */
export function computeWaitMinutes(checkInAt?: string | null): number {
  if (!checkInAt) return 0;
  const now = new Date();
  let start: Date;

  if (checkInAt.includes("T")) {
    start = new Date(checkInAt);
    if (Number.isNaN(start.getTime())) return 0;
  } else {
    const parts = checkInAt.split(":");
    if (parts.length < 2) return 0;
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
    start = new Date(now);
    start.setHours(hours, minutes, 0, 0);
    if (start > now) start.setDate(start.getDate() - 1);
  }

  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60_000));
}

export function sortVisitsByToken<T extends { token?: number }>(visits: T[]): T[] {
  return [...visits].sort((a, b) => (a.token ?? 99_999) - (b.token ?? 99_999));
}

export function isRedFlagVisit(visit: { routingNote?: string; notes?: string }) {
  const note = `${visit.routingNote ?? ""} ${visit.notes ?? ""}`.toUpperCase();
  return note.includes("RED FLAG");
}

/** Urgent (red-flag) visits first, then FIFO by token. */
export function sortQueueVisits<T extends { token?: number; routingNote?: string; notes?: string }>(
  visits: T[],
): T[] {
  return [...visits].sort((a, b) => {
    const aUrgent = isRedFlagVisit(a) ? 0 : 1;
    const bUrgent = isRedFlagVisit(b) ? 0 : 1;
    if (aUrgent !== bUrgent) return aUrgent - bUrgent;
    return (a.token ?? 99_999) - (b.token ?? 99_999);
  });
}

export function isAwaitingJuniorExam(visit: { stage: string; exam?: string }) {
  return visit.stage === "junior_exam" && visit.exam !== "done";
}

/** Reception + display-board queue through consultant handoff (excludes completed visits). */
export function isInReceptionQueue(visit: { stage: string }) {
  return ["queued", "junior_exam", "with_doctor"].includes(visit.stage);
}

export function isAwaitingConsultant(visit: { stage: string; exam?: string }) {
  return visit.stage === "with_doctor" && visit.exam === "done";
}

export function branchCodeFromBranchId(branchId: string | undefined | null): string {
  if (!branchId) return "XX";
  const parts = branchId.split("_");
  const last = parts[parts.length - 1];
  if (!last) return "XX";
  return last.slice(0, 2).toUpperCase();
}

export function nextUhid(counter: number, branchId?: string) {
  const code = branchCodeFromBranchId(branchId);
  return `NV-${code}-2026-${String(counter).padStart(4, "0")}`;
}

export function templateAmount(templateId: string) {
  return BILLING_TEMPLATES.find((t) => t.id === templateId)?.amount ?? 1500;
}

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}

type PatientNameSource = {
  name?: string | null;
  fullName?: string | null;
  uhid?: string | null;
};

export function patientDisplayName(row: PatientNameSource): string {
  const combined = String(row.name ?? row.fullName ?? "").trim();
  if (combined) return combined;
  if (row.uhid) return `Patient ${row.uhid}`;
  return "Unknown patient";
}

type PrismaPatientRow = PatientNameSource & {
  id: string;
  uhid: string;
  phone: string;
  email?: string | null;
  age?: number | null;
  gender?: string | null;
  department?: string | null;
  departmentId?: string | null;
  tags?: unknown;
  balance?: unknown;
  lastVisit?: string | null;
  referrer?: string | null;
  referralDoctorId?: string | null;
  referralDoctorName?: string | null;
  meta?: unknown;
};

export function mapPrismaPatientRow(row: PrismaPatientRow): Patient {
  const reg = parsePatientRegistrationMeta(row.meta);
  return {
    id: row.id,
    uhid: row.uhid,
    name: patientDisplayName(row),
    phone: row.phone,
    email: row.email ?? undefined,
    age: row.age ?? 0,
    gender: (row.gender ?? "O") as Patient["gender"],
    department: row.department ?? "",
    departmentId: row.departmentId ?? "",
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    balance: Number(row.balance ?? 0),
    lastVisit: row.lastVisit ?? undefined,
    referrer: row.referrer ?? reg.referrerName ?? undefined,
    referrerSource: reg.referrerSource,
    corporateId: reg.corporateId,
    referralDoctorId: row.referralDoctorId ?? undefined,
    referralDoctorName: row.referralDoctorName ?? undefined,
    registrationNotes: reg.registrationNotes,
    consentTreatment: reg.consentTreatment,
    consentData: reg.consentData,
    country: reg.country,
    state: reg.state,
    district: reg.district,
    city: reg.city,
    society: reg.society,
    houseNumber: reg.houseNumber,
    street: reg.street,
    locality: reg.locality,
    landmark: reg.landmark,
    address: reg.address,
    pincode: reg.pincode,
  };
}

export function matchPatientByQuery(patients: Patient[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return patients.find(
    (p) =>
      p.uhid.toLowerCase() === q ||
      p.id === q ||
      normalizePhone(p.phone) === normalizePhone(q) ||
      patientDisplayName(p).toLowerCase().includes(q),
  );
}

export function findDuplicatePatients(patients: Patient[], phone: string, firstName?: string) {
  const phoneNorm = normalizePhone(phone);
  return patients.filter((p) => {
    if (phoneNorm && normalizePhone(p.phone) === phoneNorm) return true;
    if (firstName && patientDisplayName(p).toLowerCase().startsWith(firstName.toLowerCase())) return true;
    return false;
  });
}

export const STAGE_ORDER: VisitStage[] = [
  "registered",
  "checked_in",
  "billing",
  "queued",
  "junior_exam",
  "with_doctor",
  "completed",
];

export function canTransition(from: VisitStage, to: VisitStage) {
  return STAGE_ORDER.indexOf(to) >= STAGE_ORDER.indexOf(from);
}

export function billingFromMode(mode: string): BillingStatus {
  if (mode === "defer") return "deferred";
  return "paid";
}

export function ageFromDob(dob: string) {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

export type FormSubmission = {
  id: string;
  formId: string;
  patientId?: string;
  visitId?: string;
  data: Record<string, string | number | boolean>;
  submittedAt: string;
};

export type Appointment = {
  id: string;
  patientId: string;
  visitId?: string;
  departmentId: string;
  doctorId: string;
  doctorName: string;
  date: string;
  time: string;
  durationMin: number;
  notes?: string;
  status: "booked" | "checked_in" | "cancelled";
};

export type FrontdeskCounters = {
  patient: number;
  visit: number;
  token: number;
  appointment: number;
};

export type ActionItem = {
  id: string;
  priority: "urgent" | "high" | "normal";
  text: string;
  action: string;
  href: string;
};

export function formatExamStatus(exam: ExamStatus | null | undefined): string {
  return (exam ?? "not_started").replace(/_/g, " ");
}

export function formatStageStatus(stage: VisitStage | string | null | undefined): string {
  return (stage ?? "unknown").replace(/_/g, " ");
}

export function buildActionItems(visits: Visit[], patients: Patient[]): ActionItem[] {
  const items: ActionItem[] = [];
  for (const v of visits) {
    const p = patients.find((x) => x.id === v.patientId);
    if (!p) continue;
    const label = patientDisplayName(p);
    if (isRedFlagVisit(v)) {
      items.push({
        id: `rf-${v.id}`,
        priority: "urgent",
        text: `${label} — RED FLAG escalation · ${v.routingNote ?? "review immediately"}`,
        action: "Open queue",
        href: `/app/frontdesk/queue`,
      });
    } else if (v.stage === "junior_exam" && (v.exam ?? "not_started") !== "done") {
      items.push({
        id: `je-${v.id}`,
        priority: v.billing === "deferred" ? "urgent" : "high",
        text: `${label} — junior exam ${formatExamStatus(v.exam)}`,
        action: "Open junior exam",
        href: `/app/frontdesk/junior-exam/${v.id}`,
      });
    } else if (v.stage === "nursing_queue" || v.stage === "nursing_active") {
      items.push({
        id: `nurse-${v.id}`,
        priority: "high",
        text: `${label} — nursing intake · ${v.counselPackageLabel ?? "care package"}`,
        action: "Open episode",
        href: `/app/nurse/episode/${v.id}`,
      });
    } else if (v.stage === "ipd_admitted") {
      items.push({
        id: `ipd-${v.id}`,
        priority: v.billing === "partial" ? "high" : "normal",
        text: `${label} — IPD admitted · ${v.billing}${v.balanceDue ? ` · ₹${v.balanceDue} due` : ""}`,
        action: "Open patient",
        href: `/app/frontdesk/patients/${p.id}`,
      });
    } else if (v.stage === "billing" || (v.stage === "checked_in" && v.billing === "pending")) {
      items.push({
        id: `bill-${v.id}`,
        priority: "high",
        text: `${label} — billing ${v.billing}`,
        action: "Create bill",
        href: `/app/frontdesk/billing?visit=${v.id}`,
      });
    } else if (v.stage === "registered") {
      items.push({
        id: `ci-${v.id}`,
        priority: "normal",
        text: `${label} — registered, awaiting check-in`,
        action: "Check in",
        href: `/app/frontdesk/check-in?visit=${v.id}`,
      });
    }
  }
  return items.slice(0, 6);
}

export function computeKpis(visits: Visit[]) {
  const todayVisits = visits.filter((v) => v.checkInAt || v.stage !== "registered");
  const checkedIn = todayVisits.filter((v) => v.stage !== "registered").length;
  const billed = todayVisits.filter((v) => v.billing === "paid" || v.billing === "deferred").length;
  const inQueue = visits.filter((v) => isInReceptionQueue(v)).length;
  const junior = visits.filter((v) => v.stage === "junior_exam").length;
  const withDoctor = visits.filter((v) => v.stage === "with_doctor").length;
  const collected = todayVisits
    .filter((v) => v.billing === "paid" && v.billAmount)
    .reduce((s, v) => s + (v.billAmount ?? 0), 0);

  return [
    { label: "Arrivals today", value: String(todayVisits.length || visits.length), delta: "Live count", trend: "neutral" as const },
    { label: "Checked in", value: String(checkedIn), delta: checkedIn ? `${Math.round((checkedIn / Math.max(todayVisits.length, 1)) * 100)}% of arrivals` : "—", trend: "neutral" as const },
    { label: "Billed (paid)", value: String(billed), delta: collected ? `₹${(collected / 1000).toFixed(1)}k collected` : "—", trend: "up" as const },
    { label: "In queue", value: String(inQueue), delta: inQueue ? `${inQueue} waiting` : "Clear", trend: inQueue > 3 ? ("down" as const) : ("neutral" as const) },
    { label: "Junior exam", value: String(junior), delta: junior ? `${junior} active` : "None", trend: "neutral" as const },
    { label: "With doctor", value: String(withDoctor), delta: withDoctor ? "In consult" : "—", trend: "neutral" as const },
  ];
}

export function examStatusFromForm(_data: Record<string, string | number | boolean>): ExamStatus {
  return "done";
}
