import type { FormSchema } from "@/design-system/frontdesk-schemas";

export const DOCTOR_EXAMINATION_SCHEMA: FormSchema = {
  id: "doctor-examination",
  title: "Examination",
  sections: [
    {
      id: "complaint",
      label: "Chief complaint & history",
      fields: [
        { id: "chiefComplaint", type: "textarea", label: "Chief complaints", required: true, span: 2 },
        { id: "vitalsBp", type: "text", label: "Blood pressure", placeholder: "120/80" },
        { id: "vitalsPulse", type: "number", label: "Pulse (bpm)" },
        { id: "vitalsWeight", type: "number", label: "Weight (kg)" },
        { id: "vitalsSpo2", type: "number", label: "SpO₂ (%)" },
        { id: "historyPresent", type: "textarea", label: "History of present illness", span: 2 },
        { id: "pastHistory", type: "textarea", label: "Past medical / surgical history", span: 2 },
        { id: "allergies", type: "text", label: "Allergies", placeholder: "NKDA" },
      ],
    },
    {
      id: "exam",
      label: "Physical examination",
      fields: [
        { id: "generalExam", type: "textarea", label: "General examination", span: 2 },
        { id: "mskExam", type: "textarea", label: "MSK / regional examination", required: true, span: 2 },
        { id: "neuroExam", type: "textarea", label: "Neurological examination", span: 2 },
        { id: "specialTests", type: "textarea", label: "Special tests", span: 2 },
      ],
    },
  ],
};

export const DOCTOR_DIAGNOSIS_SCHEMA: FormSchema = {
  id: "doctor-diagnosis",
  title: "Diagnosis",
  sections: [
    {
      id: "dx",
      label: "Diagnosis",
      fields: [
        { id: "primaryDiagnosis", type: "text", label: "Primary diagnosis", required: true, span: 2 },
        { id: "secondaryDiagnosis", type: "text", label: "Secondary diagnosis", span: 2 },
        {
          id: "icdTag",
          type: "select",
          label: "ICD / disease mapping",
          options: [
            { value: "M51.1", label: "M51.1 — Lumbar disc" },
            { value: "M47.8", label: "M47.8 — Cervical spondylosis" },
            { value: "M25.5", label: "M25.5 — Joint pain" },
            { value: "E88.81", label: "E88.81 — Metabolic syndrome" },
          ],
        },
        {
          id: "severity",
          type: "select",
          label: "Severity",
          defaultValue: "moderate",
          options: [
            { value: "mild", label: "Mild" },
            { value: "moderate", label: "Moderate" },
            { value: "severe", label: "Severe" },
          ],
        },
        { id: "clinicalImpression", type: "textarea", label: "Clinical impression", required: true, span: 2 },
      ],
    },
  ],
};

export const DOCTOR_TREATMENT_SCHEMA: FormSchema = {
  id: "doctor-treatment",
  title: "Treatment plan",
  sections: [
    {
      id: "plan",
      label: "Treatment",
      fields: [
        { id: "plan", type: "textarea", label: "Treatment plan", required: true, span: 2 },
        { id: "procedures", type: "textarea", label: "Procedures / interventions", span: 2 },
        { id: "physioProtocol", type: "text", label: "Physio protocol" },
        { id: "followUp", type: "text", label: "Follow-up", placeholder: "2 weeks" },
        { id: "lifestyleAdvice", type: "textarea", label: "Lifestyle advice", span: 2 },
        { id: "referrals", type: "text", label: "Referrals", placeholder: "None" },
      ],
    },
  ],
};

export const DOCTOR_HANDOFF_SCHEMA: FormSchema = {
  id: "doctor-handoff",
  title: "Counsellor handoff",
  sections: [
    {
      id: "counsellor",
      label: "Commercial handoff",
      fields: [
        { id: "counsellorNotes", type: "textarea", label: "Counsellor notes", span: 2, hint: "Visible to counsellor in full" },
        { id: "doctorAdvice", type: "textarea", label: "Doctor advice to patient", span: 2 },
        { id: "conversionPriority", type: "select", label: "Conversion priority", defaultValue: "normal", options: [
          { value: "normal", label: "Normal" },
          { value: "high", label: "High — warm lead" },
        ]},
      ],
    },
  ],
};

export const DOCTOR_IPD_ROUND_SCHEMA: FormSchema = {
  id: "doctor-ipd-round",
  title: "IPD round note",
  sections: [
    {
      id: "round",
      label: "Round assessment",
      fields: [
        { id: "subjective", type: "textarea", label: "Subjective", span: 2 },
        { id: "objective", type: "textarea", label: "Objective", span: 2 },
        { id: "assessment", type: "textarea", label: "Assessment", span: 2 },
        { id: "plan", type: "textarea", label: "Plan", span: 2 },
      ],
    },
    {
      id: "orders",
      label: "Orders & reports",
      fields: [
        { id: "medicines", type: "textarea", label: "Medicines", span: 2, hint: "Connected to pharmacy when saved" },
        { id: "labReports", type: "textarea", label: "Lab reports", span: 2 },
        { id: "radiologyReports", type: "textarea", label: "Radiology reports", span: 2 },
      ],
    },
    {
      id: "course",
      label: "Course & follow-up",
      fields: [
        { id: "progress", type: "textarea", label: "Progress since admission / last round", span: 2 },
        { id: "complications", type: "textarea", label: "Complications / concerns", span: 2 },
        { id: "nextProcedure", type: "textarea", label: "Next procedure / intervention", span: 2 },
        { id: "observation", type: "textarea", label: "Observation / monitoring", span: 2 },
        { id: "advice", type: "textarea", label: "Advice to patient / relatives", span: 2 },
      ],
    },
  ],
};

export const ALL_DOCTOR_SCHEMAS = [
  DOCTOR_EXAMINATION_SCHEMA,
  DOCTOR_DIAGNOSIS_SCHEMA,
  DOCTOR_TREATMENT_SCHEMA,
  DOCTOR_HANDOFF_SCHEMA,
  DOCTOR_IPD_ROUND_SCHEMA,
];
