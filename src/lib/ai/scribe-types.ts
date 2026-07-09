import type { PrescriptionLine } from "@/design-system/doctor-data";

export type ScribeDraft = {
  summary: string;
  examination: Record<string, string | number | boolean>;
  diagnosis: Record<string, string | number | boolean>;
  treatment: Record<string, string | number | boolean>;
  prescription: Omit<PrescriptionLine, "id">[];
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
