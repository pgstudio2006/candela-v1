import type { DurationUnit, PrescriptionLine } from "@/design-system/doctor-data";

export type ScribeDraft = {
  summary: string;
  examination: Record<string, string | number | boolean>;
  diagnosis: Record<string, string | number | boolean>;
  treatment: Record<string, string | number | boolean>;
  prescription: Omit<PrescriptionLine, "id">[];
};

const SCRIBE_UNIT_WORDS: Record<string, DurationUnit> = {
  day: "days",
  days: "days",
  week: "weeks",
  weeks: "weeks",
  month: "months",
  months: "months",
  year: "years",
  years: "years",
  hour: "hours",
  hours: "hours",
  hr: "hours",
  minute: "minutes",
  minutes: "minutes",
  min: "minutes",
};

/**
 * The scribe LLM returns free-text durations like "3 days"; the prescription
 * editor and prints work from the structured `days` + `durationUnit` numbers.
 * Convert (and drop the free text) so the doctor's number always prints.
 */
export function normalizeScribePrescriptionLine(
  line: Partial<PrescriptionLine> & { duration?: string },
): Omit<PrescriptionLine, "id"> {
  let days = Number(line.days ?? 0);
  let unit = line.durationUnit;
  const raw = String(line.duration ?? "").trim();
  if ((!Number.isFinite(days) || days <= 0) && raw) {
    const match = raw.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
    if (match) {
      days = Number(match[1]);
      unit = SCRIBE_UNIT_WORDS[match[2].toLowerCase()] ?? "days";
    } else {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) days = parsed;
    }
  }
  if (!Number.isFinite(days) || days <= 0) days = 7;
  return {
    drug: String(line.drug ?? ""),
    drugId: typeof line.drugId === "string" && line.drugId ? line.drugId : undefined,
    dose: String(line.dose ?? "1 tab"),
    frequency: String(line.frequency ?? "OD"),
    days,
    durationUnit: unit ?? "days",
    instructions: line.instructions ? String(line.instructions) : undefined,
  };
}

export type IpdRoundScribeDraft = {
  summary: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  medicines: string;
  labReports: string;
  radiologyReports: string;
  progress: string;
  complications: string;
  nextProcedure: string;
  observation: string;
  advice: string;
};

export type CopilotMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type CopilotAction =
  | {
      type: "fill_section";
      visitId: string;
      section: "examination" | "diagnosis" | "treatment";
      data: Record<string, string | number | boolean>;
    }
  | { type: "set_prescription"; visitId: string; lines: Omit<PrescriptionLine, "id">[] }
  | { type: "navigate"; href: string; label?: string }
  | { type: "register_patient"; data: Record<string, string | number | boolean> }
  | { type: "check_in"; query: string; doctor?: string; department?: string; visitId?: string }
  | { type: "process_billing"; visitId: string; data: Record<string, string | number | boolean> }
  | {
      type: "book_appointment";
      patientQuery: string;
      doctor?: string;
      department?: string;
      date?: string;
      time?: string;
      duration?: number;
      notes?: string;
    }
  | { type: "complete_junior_exam"; visitId: string; data: Record<string, string | number | boolean> }
  | { type: "save_submission"; formId: string; visitId: string; data: Record<string, string | number | boolean> }
  | { type: "update_patient"; patientId: string; data: Record<string, string | number | boolean> }
  | { type: "cancel_appointment"; appointmentId: string }
  | {
      type: "reschedule_appointment";
      appointmentId: string;
      date: string;
      time: string;
      doctor?: string;
      department?: string;
    };

export type CopilotContext = {
  module: string;
  role: string;
  page: string;
  visitId?: string;
  patient?: { name: string; uhid?: string; age?: number };
  queueSummary?: string;
  consultSnapshot?: {
    examination?: Record<string, unknown>;
    diagnosis?: Record<string, unknown>;
    treatment?: Record<string, unknown>;
    prescription?: PrescriptionLine[];
    transcript?: string;
  };
};
