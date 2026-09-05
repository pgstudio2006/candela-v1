import type { ConsultationRecord, DoctorTemplate, PrescriptionLine } from "@/design-system/doctor-data";
import { scribeLanguageLabel as scribeLangLabel } from "@/lib/ai/deepgram-languages";

export type PatientClinicalRecord = {
  visitId: string;
  patientId: string;
  date: string;
  doctorName: string;
  status: ConsultationRecord["status"];
  treatmentMode: ConsultationRecord["treatmentMode"];
  primaryDiagnosis: string;
  hasScribe: boolean;
  hasPrescription: boolean;
  consult: ConsultationRecord;
};

export function formatConsultDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function consultPrimaryDiagnosis(c: ConsultationRecord) {
  return String(
    c.diagnosis.primaryDiagnosis ?? c.diagnosis.clinicalImpression ?? "Consultation",
  );
}

const DURATION_UNIT_LABELS: Record<string, string> = {
  minutes: "min",
  hours: "hr",
  days: "day",
  weeks: "wk",
  months: "mo",
  years: "yr",
};

/**
 * Human-readable duration for a prescription line.
 * The editor saves `days` + `durationUnit`; older rows may only carry the
 * legacy free-text `duration` string, which is preferred when present.
 */
export function formatPrescriptionDuration(
  line: Pick<PrescriptionLine, "duration" | "days" | "durationUnit">,
): string {
  const legacy = String(line.duration ?? "").trim();
  if (legacy) return legacy;
  const n = Number(line.days ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const label = DURATION_UNIT_LABELS[line.durationUnit ?? "days"] ?? "day";
  return `${n} ${label}${n > 1 ? "s" : ""}`;
}

export function fieldEntries(data: Record<string, string | number | boolean>) {
  return Object.entries(data).filter(([, v]) => v !== "" && v !== undefined && v !== null);
}

export function scribeLanguageLabel(id?: string) {
  return id ? scribeLangLabel(id) : "—";
}

export function humanizeFieldKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function mergeDoctorTemplates(
  seed: DoctorTemplate[],
  custom: DoctorTemplate[],
  doctorId: string,
) {
  const mine = custom.filter((t) => t.doctorId === doctorId);
  const seedMine = seed.filter((t) => t.doctorId === doctorId || t.doctorId === "dr_1");
  const ids = new Set(mine.map((t) => t.id));
  return [...mine, ...seedMine.filter((t) => !ids.has(t.id))];
}

export function printHtmlElement(elementId: string, title: string) {
  const node = document.getElementById(elementId);
  if (!node) return;
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1b1b1b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .print-root { width: 100%; }
    </style>
  </head><body>${node.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 400);
}
