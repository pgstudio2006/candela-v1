import type { FormSchema } from "@/design-system/frontdesk-schemas";

export const PHARMACY_DISPENSE_SCHEMA: FormSchema = {
  id: "pharmacy-dispense",
  title: "Dispensing checklist",
  sections: [
    {
      id: "dispense",
      label: "Dispense verification",
      fields: [
        { id: "batchVerified", type: "toggle", label: "Batch & expiry verified" },
        { id: "labelChecked", type: "toggle", label: "Patient label checked" },
        { id: "counsellingDone", type: "toggle", label: "Patient counselling completed" },
        { id: "scheduleH", type: "toggle", label: "Schedule H register entry" },
        { id: "dispenseNotes", type: "textarea", label: "Dispensing notes", span: 2 },
      ],
    },
  ],
};

export const PHARMACY_INTAKE_SCHEMA: FormSchema = {
  id: "pharmacy-intake",
  title: "Walk-in pharmacy intake",
  sections: [
    {
      id: "intake",
      label: "Patient intake",
      fields: [
        { id: "patientName", type: "text", label: "Patient name" },
        { id: "uhid", type: "text", label: "UHID / MRN" },
        { id: "prescriptionRef", type: "text", label: "Prescription reference" },
        { id: "paymentMode", type: "payment-mode", label: "Payment mode" },
        { id: "intakeNotes", type: "textarea", label: "Notes", span: 2 },
      ],
    },
  ],
};
