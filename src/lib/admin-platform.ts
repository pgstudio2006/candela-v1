import type {
  DepartmentHawkEye,
  PrevalenceInsight,
  RevenueLeakageFlag,
  ShareSimulation,
} from "@/design-system/admin-data";
import type { Patient, Visit } from "@/design-system/frontdesk-data";

const DOCTOR_KEY = "candela-doctor-v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* empty */
  }
  return fallback;
}

export function computeHawkEye(visits: Visit[]): DepartmentHawkEye[] {
  const fdQueue = visits.filter((v) => ["queued", "junior_exam", "billing", "checked_in"].includes(v.stage)).length;
  const fdBilling = visits.filter((v) => v.stage === "billing" || v.billing === "pending").length;

  const doctorQueue = visits.filter((v) => ["queued", "junior_exam", "with_doctor"].includes(v.stage)).length;

  const nurseQueue = visits.filter((v) => v.stage === "nursing_queue" || v.stage === "nursing_active").length;

  const collected = visits.reduce((s, v) => s + (v.amountPaid ?? (v.billing === "paid" ? v.billAmount ?? 0 : 0)), 0);

  return [
    {
      moduleId: "frontdesk",
      label: "Front Desk",
      status: fdBilling > 3 ? "watch" : "healthy",
      queue: fdQueue,
      slaBreaches: visits.filter((v) => v.waitMin > 20).length,
      revenueToday: collected,
      blockers: fdBilling ? [`${fdBilling} billing pending`] : [],
    },
    {
      moduleId: "doctor",
      label: "Doctor",
      status: doctorQueue > 5 ? "watch" : "healthy",
      queue: doctorQueue,
      slaBreaches: 0,
      revenueToday: 0,
      blockers: doctorQueue ? [`${doctorQueue} in clinical queue`] : [],
    },
    {
      moduleId: "nurse",
      label: "Nursing",
      status: nurseQueue > 2 ? "critical" : nurseQueue ? "watch" : "healthy",
      queue: nurseQueue,
      slaBreaches: nurseQueue,
      revenueToday: 0,
      blockers: nurseQueue ? [`${nurseQueue} awaiting consent / intake`] : [],
    },
  ];
}

export function computeLeakageFlags(visits: Visit[], patients: Patient[] = []): RevenueLeakageFlag[] {
  const flags: RevenueLeakageFlag[] = [];
  for (const v of visits) {
    const p = patients.find((x) => x.id === v.patientId);
    if (v.billing === "partial" && v.balanceDue && v.balanceDue > 0) {
      flags.push({
        id: `lk_partial_${v.id}`,
        type: "partial_uncollected",
        patientName: p?.name ?? v.id,
        visitId: v.id,
        amount: v.balanceDue,
        daysOpen: v.waitMin || 3,
        suggestion: "Call patient · offer EMI or desk collection before session 2",
        priority: v.balanceDue > 20000 ? "high" : "medium",
      });
    }
    if (v.billing === "deferred") {
      flags.push({
        id: `lk_defer_${v.id}`,
        type: "defer_aging",
        patientName: p?.name ?? v.id,
        visitId: v.id,
        amount: v.billAmount ?? 0,
        daysOpen: 14,
        suggestion: "CRM follow-up · verify defer authorization still valid",
        priority: "medium",
      });
    }
    if (v.stage === "nursing_queue" && v.billing === "paid") {
      flags.push({
        id: `lk_consent_${v.id}`,
        type: "consent_delay",
        patientName: p?.name ?? v.id,
        visitId: v.id,
        amount: 0,
        daysOpen: 1,
        suggestion: "Nursing intake SLA — consent gate blocking treatment start",
        priority: "high",
      });
    }
  }
  return flags.sort((a, b) => (a.priority === "high" ? -1 : 1));
}

export function computePrevalence(visits: Visit[]): PrevalenceInsight[] {
  const doctor = readJson<{ consultations?: { diagnosis?: Record<string, string | number | boolean> }[] }>(DOCTOR_KEY, {});
  const counts: Record<string, number> = {};
  for (const c of doctor.consultations ?? []) {
    const dx = String(c.diagnosis?.primaryDiagnosis ?? "Unspecified");
    counts[dx] = (counts[dx] ?? 0) + 1;
  }
  if (Object.keys(counts).length === 0) {
    counts["Lumbar disc disease"] = 12;
    counts["Cervical spondylosis"] = 8;
    counts["Metabolic syndrome"] = 5;
  }
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  return Object.entries(counts)
    .map(([diagnosis, count]) => ({
      diagnosis,
      count,
      percent: Math.round((count / total) * 100),
      trend: "stable" as const,
      ageBand: "35–55",
      anonymized: true as const,
    }))
    .sort((a, b) => b.count - a.count);
}

export function simulateRevenueShare(
  doctorId: string,
  doctorName: string,
  policy: { opdConsultPercent: number; packageNetPercent: number; ipdDayFixed: number },
  visits: Visit[],
): ShareSimulation {
  const doctorVisits = visits.filter((v) => v.doctorId === doctorId);
  const packages = doctorVisits.filter((v) => v.counselPackageLabel || (v.billAmount ?? 0) > 5000);
  const gross = packages.reduce((s, v) => s + (v.amountPaid ?? v.billAmount ?? 0), 0);
  const opd = doctorVisits.filter((v) => (v.billAmount ?? 0) <= 5000).length * 1500 * (policy.opdConsultPercent / 100);
  const pkgShare = gross * (policy.packageNetPercent / 100);
  const ipdDays = doctorVisits.filter((v) => v.treatmentPath === "ipd").length;
  return {
    doctorName,
    packagesClosed: packages.length,
    gross,
    share: Math.round(opd + pkgShare + ipdDays * policy.ipdDayFixed),
  };
}

export function computeCommandKpis(
  visits: Visit[],
  staff: { onDuty: boolean }[] = [],
  mrdRequests: { status: string }[] = [],
  patients: Patient[] = [],
  auditCount = 0,
  payments: { amount: number; status: string }[] = [],
) {
  const collected = payments
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + (p.amount ?? 0), 0);
  const balance = patients.reduce((s, p) => s + p.balance, 0);
  const inPipeline = visits.filter((v) => !["completed", "registered"].includes(v.stage)).length;
  const onDuty = staff.filter((s) => s.onDuty).length;
  const mrdPending = mrdRequests.filter((r) => r.status !== "released" && r.status !== "rejected").length;

  return [
    { label: "Revenue collected", value: `₹${(collected / 100000).toFixed(1)}L`, delta: "Live from payment records", trend: "up" as const },
    { label: "Outstanding balance", value: `₹${(balance / 1000).toFixed(0)}K`, delta: "Partial & defer ledger", trend: balance > 50000 ? ("down" as const) : ("neutral" as const) },
    { label: "Active pipeline", value: String(inPipeline), delta: "Cross-module visits", trend: "neutral" as const },
    { label: "Audit events", value: String(auditCount), delta: "From database audit log", trend: "neutral" as const },
    { label: "Staff on duty", value: staff.length ? `${onDuty} / ${staff.length}` : "—", delta: "Live roster", trend: "neutral" as const },
    { label: "MRD pending", value: String(mrdPending), delta: "SLA tracked", trend: mrdPending > 0 ? ("down" as const) : ("neutral" as const) },
  ];
}
