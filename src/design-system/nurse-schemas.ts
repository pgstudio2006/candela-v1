import type { FormSchema } from "@/design-system/frontdesk-schemas";

export const NURSE_VITALS_SCHEMA: FormSchema = {
  id: "nurse-vitals",
  title: "Vitals & nursing assessment",
  sections: [
    {
      id: "vitals",
      label: "Vitals",
      fields: [
        { id: "bpSystolic", type: "number", label: "BP systolic", required: true },
        { id: "bpDiastolic", type: "number", label: "BP diastolic", required: true },
        { id: "pulse", type: "number", label: "Pulse (bpm)", required: true },
        { id: "spo2", type: "number", label: "SpO₂ (%)", required: true },
        { id: "temperature", type: "number", label: "Temperature (°C)", required: true },
        { id: "weight", type: "number", label: "Weight (kg)" },
        { id: "painScore", type: "pain-scale", label: "Pain score (0–10)", required: true },
      ],
    },
    {
      id: "assessment",
      label: "Clinical assessment",
      fields: [
        { id: "allergies", type: "allergy-list", label: "Allergies", defaultValue: "None known", span: 2 },
        { id: "redFlags", type: "textarea", label: "Red flags / contraindications", span: 2, placeholder: "Neurological deficit, anticoagulation, pregnancy…" },
        { id: "nursingNotes", type: "textarea", label: "Nursing notes", span: 2 },
      ],
    },
  ],
};

export const NURSE_CONSENT_NOTES_SCHEMA: FormSchema = {
  id: "nurse-consent-notes",
  title: "Consent witness notes",
  sections: [
    {
      id: "witness",
      label: "Witness & verification",
      fields: [
        { id: "witnessName", type: "text", label: "Witness name" },
        { id: "relationship", type: "text", label: "Relationship to patient" },
        { id: "verificationNotes", type: "textarea", label: "Verification notes", span: 2 },
        { id: "consentVersion", type: "consent-version", label: "Consent template version" },
      ],
    },
  ],
};

export const NURSE_SESSION_NOTES_SCHEMA: FormSchema = {
  id: "nurse-session-notes",
  title: "Treatment session notes",
  sections: [
    {
      id: "session",
      label: "Session documentation",
      fields: [
        { id: "procedurePerformed", type: "text", label: "Procedure performed", required: true, span: 2 },
        { id: "patientTolerance", type: "select", label: "Patient tolerance", options: [
          { value: "good", label: "Good" },
          { value: "fair", label: "Fair" },
          { value: "poor", label: "Poor" },
        ]},
        { id: "adverseEvents", type: "textarea", label: "Adverse events", span: 2 },
        { id: "sessionNotes", type: "textarea", label: "Session notes", required: true, span: 2 },
      ],
    },
  ],
};

export const NURSE_SCORES_SCHEMA: FormSchema = {
  id: "nurse-scores",
  title: "Nursing scores",
  sections: [
    {
      id: "scores",
      label: "Score capture (0–10)",
      fields: [
        { id: "painIntensity", type: "slider", label: "Pain intensity", hint: "0 = no pain, 10 = worst pain" },
        { id: "nausea", type: "slider", label: "Nausea", hint: "0 = none, 10 = severe" },
        { id: "anxiety", type: "slider", label: "Anxiety", hint: "0 = none, 10 = severe" },
        { id: "scoreNotes", type: "textarea", label: "Score notes", span: 2 },
      ],
    },
  ],
};
