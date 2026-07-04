/** Attio-style schema-driven forms for Front Desk */

export type FieldType =
  | "text"
  | "email"
  | "phone"
  | "url"
  | "password"
  | "number"
  | "currency"
  | "percent"
  | "rating"
  | "date"
  | "time"
  | "datetime"
  | "duration"
  | "select"
  | "multiselect"
  | "radio"
  | "checkbox"
  | "textarea"
  | "toggle"
  | "icd-picker"
  | "body-region"
  | "pain-scale"
  | "allergy-list"
  | "vitals-group"
  | "package-picker"
  | "discount-percent"
  | "payment-mode"
  | "society-search"
  | "file"
  | "image"
  | "signature"
  | "consent-version"
  | "formula"
  | "section"
  | "divider"
  | "help";

export type SchemaField = {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** When true, appends an "Other" choice and shows a detail text field when selected. */
  allowOther?: boolean;
  /** Placeholder for the "Other" detail text field. */
  otherPlaceholder?: string;
  defaultValue?: string | number | boolean;
  span?: 1 | 2;
  hint?: string;
  department?: string;
  category?: "basic" | "numeric" | "datetime" | "choice" | "clinical" | "commercial" | "media" | "layout" | "compliance" | "computed";
  readOnly?: boolean;
};

export type FormSchema = {
  id: string;
  title: string;
  sections: { id: string; label: string; fields: SchemaField[] }[];
};

import {
  APPOINTMENT_CENTRES,
  HEAR_ABOUT_OPTIONS,
  INDIA_COUNTRY,
} from "@/lib/india-locations";

export const REGISTRATION_SCHEMA: FormSchema = {
  id: "registration",
  title: "Patient registration",
  sections: [
    {
      id: "patient",
      label: "Patient details",
      fields: [
        {
          id: "fullName",
          type: "text",
          label: "Full name",
          required: true,
          placeholder: "Patient full name",
          span: 2,
        },
        {
          id: "phone",
          type: "phone",
          label: "Mobile no",
          required: true,
          placeholder: "10-digit mobile",
        },
        {
          id: "alternatePhone",
          type: "phone",
          label: "Alternate number",
          placeholder: "Optional",
        },
        { id: "email", type: "email", label: "Email", placeholder: "patient@email.com" },
        {
          id: "gender",
          type: "radio",
          label: "Gender",
          required: true,
          span: 2,
          options: [
            { value: "M", label: "Male" },
            { value: "F", label: "Female" },
            { value: "O", label: "Other" },
          ],
        },
        { id: "dob", type: "date", label: "Date of birth", placeholder: "dd-mm-yyyy" },
        { id: "age", type: "number", label: "Age", placeholder: "Optional" },
        {
          id: "appointmentCentre",
          type: "select",
          label: "Appointment centre",
          defaultValue: "Navayu Gurgaon",
          options: APPOINTMENT_CENTRES,
        },
        {
          id: "country",
          type: "select",
          label: "Country",
          defaultValue: INDIA_COUNTRY,
          options: [{ value: INDIA_COUNTRY, label: INDIA_COUNTRY }],
        },
        {
          id: "state",
          type: "select",
          label: "State",
          required: true,
          defaultValue: "Haryana",
          options: [],
        },
        {
          id: "district",
          type: "select",
          label: "District",
          required: true,
          defaultValue: "Gurugram",
          options: [],
        },
        {
          id: "city",
          type: "text",
          label: "City",
          required: true,
          defaultValue: "",
          placeholder: "City / town",
        },
        { id: "society", type: "society-search", label: "Society / colony", span: 2, placeholder: "Search Gurgaon society…" },
        { id: "houseNumber", type: "text", label: "House / building number", placeholder: "e.g. 42" },
        { id: "street", type: "text", label: "Street / road", placeholder: "Street name" },
        { id: "locality", type: "text", label: "Locality / area", placeholder: "e.g. Sector 15" },
        { id: "landmark", type: "text", label: "Landmark", placeholder: "Nearby landmark" },
        { id: "address", type: "textarea", label: "Full address", span: 2, placeholder: "House no, street, locality, landmark…" },
        { id: "pincode", type: "text", label: "Pincode", placeholder: "122001" },
      ],
    },
    {
      id: "visit",
      label: "Visit context",
      fields: [
        {
          id: "department",
          type: "select",
          label: "Department",
          required: true,
          options: [],
        },
        {
          id: "visitType",
          type: "select",
          label: "Visit type",
          required: true,
          defaultValue: "opd",
          options: [
            { value: "opd", label: "OPD — New" },
            { value: "followup", label: "OPD — Follow-up" },
            { value: "procedure", label: "Procedure" },
          ],
        },
        {
          id: "referrer",
          type: "select",
          label: "How did you hear about us?",
          options: HEAR_ABOUT_OPTIONS,
        },
        { id: "referrerName", type: "text", label: "Referrer name", placeholder: "Optional" },
        {
          id: "referralDoctor",
          type: "select",
          label: "Referral doctor",
          placeholder: "Select referring doctor",
          allowOther: true,
          options: [
            { value: "none", label: "None" },
          ],
        },
        { id: "corporateId", type: "text", label: "Corporate / insurance ID", placeholder: "TCS-XXXX" },
      ],
    },
    {
      id: "consent",
      label: "Consent",
      fields: [
        { id: "consentTreatment", type: "toggle", label: "Consent for treatment", defaultValue: true },
        { id: "consentData", type: "toggle", label: "Consent for data processing", defaultValue: true },
        { id: "notes", type: "textarea", label: "Registration notes", span: 2, placeholder: "Any special instructions…" },
      ],
    },
  ],
};

export const BILLING_SCHEMA: FormSchema = {
  id: "billing",
  title: "OPD billing",
  sections: [
    {
      id: "lines",
      label: "Service lines",
      fields: [
        {
          id: "template",
          type: "select",
          label: "Quick template",
          options: [
            { value: "bt1", label: "Spine OPD Consult — ₹1,500" },
            { value: "bt2", label: "Wellness OPD Consult — ₹2,000" },
            { value: "bt3", label: "X-Ray Package — ₹2,500" },
            { value: "bt4", label: "Physio Session — ₹800" },
          ],
        },
        { id: "customLine", type: "text", label: "Additional service", placeholder: "Add custom line item" },
        { id: "amount", type: "currency", label: "Amount", defaultValue: 1500 },
        { id: "discount", type: "currency", label: "Discount", defaultValue: 0 },
        {
          id: "paymentScope",
          type: "select",
          label: "Payment scope",
          defaultValue: "full",
          options: [
            { value: "full", label: "Full payment" },
            { value: "partial", label: "Partial payment" },
            { value: "defer", label: "Defer billing" },
          ],
        },
        { id: "collectedAmount", type: "currency", label: "Collected now (partial)", defaultValue: 0 },
      ],
    },
    {
      id: "payment",
      label: "Payment",
      fields: [
        {
          id: "mode",
          type: "select",
          label: "Payment mode",
          required: true,
          defaultValue: "upi",
          options: [
            { value: "cash", label: "Cash" },
            { value: "upi", label: "UPI" },
            { value: "card", label: "Card" },
            { value: "split", label: "Split payment" },
            { value: "defer", label: "Defer billing" },
          ],
        },
        { id: "deferReason", type: "textarea", label: "Defer reason", span: 2, placeholder: "Corporate billing, package pending…" },
        { id: "deferDue", type: "date", label: "Defer due date" },
      ],
    },
  ],
};

export const APPOINTMENT_SCHEMA: FormSchema = {
  id: "appointment",
  title: "Book appointment",
  sections: [
    {
      id: "slot",
      label: "Slot",
      fields: [
        { id: "patient", type: "text", label: "Patient", required: true, placeholder: "Search patient…" },
        {
          id: "department",
          type: "select",
          label: "Department",
          required: true,
          options: [],
        },
        {
          id: "doctor",
          type: "select",
          label: "Doctor",
          required: true,
          options: [],
        },
        { id: "date", type: "date", label: "Date", required: true },
        { id: "time", type: "time", label: "Time", required: true },
        {
          id: "duration",
          type: "select",
          label: "Duration",
          defaultValue: "20",
          options: [
            { value: "15", label: "15 minutes" },
            { value: "20", label: "20 minutes" },
            { value: "30", label: "30 minutes" },
            { value: "45", label: "45 minutes" },
          ],
        },
        { id: "notes", type: "textarea", label: "Notes", span: 2 },
      ],
    },
  ],
};

export const JUNIOR_EXAM_SCHEMA: FormSchema = {
  id: "junior-exam",
  title: "Junior doctor MSK intake",
  sections: [
    {
      id: "vitals",
      label: "Vitals",
      fields: [
        { id: "bpSystolic", type: "number", label: "BP systolic (mmHg)", placeholder: "120" },
        { id: "bpDiastolic", type: "number", label: "BP diastolic (mmHg)", placeholder: "80" },
        { id: "pulse", type: "number", label: "Pulse (bpm)", placeholder: "72" },
        { id: "temperature", type: "number", label: "Temperature (°F)", placeholder: "98.4" },
        { id: "spo2", type: "number", label: "SpO₂ (%)", placeholder: "98" },
        { id: "respiratoryRate", type: "number", label: "Respiratory rate", placeholder: "16" },
        { id: "weight", type: "number", label: "Weight (kg)", placeholder: "70" },
        { id: "height", type: "number", label: "Height (cm)", placeholder: "170" },
        { id: "vitalsNotes", type: "textarea", label: "Vitals notes", span: 2, placeholder: "Any abnormal findings…" },
      ],
    },
    {
      id: "complaint",
      label: "Chief complaint",
      fields: [
        { id: "chiefComplaint", type: "textarea", label: "Chief complaint", required: true, span: 2 },
        { id: "painScale", type: "number", label: "Pain scale (0–10)", defaultValue: 5 },
        { id: "duration", type: "text", label: "Duration", placeholder: "e.g. 3 weeks" },
        {
          id: "region",
          type: "select",
          label: "Primary region",
          required: true,
          options: [
            { value: "cervical", label: "Cervical spine" },
            { value: "lumbar", label: "Lumbar spine" },
            { value: "knee", label: "Knee" },
            { value: "shoulder", label: "Shoulder" },
            { value: "hip", label: "Hip" },
            { value: "metabolic", label: "Metabolic / wellness" },
          ],
        },
      ],
    },
    {
      id: "screening",
      label: "Red flags & screening",
      fields: [
        { id: "redFlags", type: "toggle", label: "Red flags present", defaultValue: false },
        { id: "redFlagNotes", type: "textarea", label: "Red flag details", span: 2 },
        { id: "priorSurgery", type: "toggle", label: "Prior surgery", defaultValue: false },
        { id: "neuroDeficit", type: "toggle", label: "Neurological deficit", defaultValue: false },
      ],
    },
    {
      id: "exam",
      label: "Examination",
      fields: [
        { id: "rom", type: "textarea", label: "Range of motion", span: 2 },
        { id: "specialTests", type: "textarea", label: "Special tests", span: 2 },
        { id: "juniorImpression", type: "textarea", label: "Junior doctor impression", required: true, span: 2 },
        { id: "seniorHandoff", type: "textarea", label: "Handoff summary for senior doctor", required: true, span: 2, hint: "Full payload — nothing hidden from consultant" },
      ],
    },
  ],
};

export const CHECKIN_SCHEMA: FormSchema = {
  id: "checkin",
  title: "Patient check-in",
  sections: [
    {
      id: "verify",
      label: "Verify",
      fields: [
        { id: "uhid", type: "text", label: "UHID / Phone search", required: true },
        {
          id: "department",
          type: "select",
          label: "Department",
          required: true,
          options: [
            { value: "dept_spine", label: "Spine & Joint Care" },
            { value: "dept_wellness", label: "Wellness & Metabolic" },
          ],
        },
        {
          id: "doctor",
          type: "select",
          label: "Assign doctor",
          required: true,
          options: [],
        },
        { id: "vitalsWeight", type: "number", label: "Weight (kg)" },
        { id: "vitalsBp", type: "text", label: "Blood pressure", placeholder: "120/80" },
      ],
    },
  ],
};
