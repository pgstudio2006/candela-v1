import type { FormSchema } from "@/design-system/frontdesk-schemas";
import {
  APPOINTMENT_CENTRES,
  INDIA_COUNTRY,
} from "@/lib/india-locations";
import { CRM_INDIAN_STATES } from "@/design-system/crm-data";

export const CRM_LEAD_CAPTURE_SCHEMA: FormSchema = {
  id: "crm-lead-capture",
  title: "Lead capture",
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
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
            { value: "other", label: "Other" },
            { value: "prefer_not", label: "Prefer not to say" },
          ],
        },
        { id: "dob", type: "date", label: "Date of birth", placeholder: "dd-mm-yyyy" },
        { id: "age", type: "number", label: "Age" },
      ],
    },
    {
      id: "address",
      label: "Address",
      fields: [
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
          options: CRM_INDIAN_STATES.map((s) => ({ value: s, label: s })),
        },
        {
          id: "district",
          type: "text",
          label: "District",
          required: true,
          placeholder: "District",
        },
        {
          id: "city",
          type: "text",
          label: "City",
          required: true,
          placeholder: "City / town",
        },
        {
          id: "houseNumber",
          type: "text",
          label: "House / building number",
          placeholder: "e.g. 42",
        },
        { id: "street", type: "text", label: "Street / road", placeholder: "Street name" },
        { id: "locality", type: "text", label: "Locality / area", placeholder: "e.g. Sector 15" },
        { id: "landmark", type: "text", label: "Landmark", placeholder: "Nearby landmark" },
        { id: "address", type: "textarea", label: "Full address", span: 2, placeholder: "House no, street, locality, landmark…" },
        { id: "pincode", type: "text", label: "Pincode", placeholder: "122001" },
      ],
    },
    {
      id: "clinical",
      label: "Clinical & appointment",
      fields: [
        {
          id: "appointmentCentre",
          type: "select",
          label: "Appointment centre",
          defaultValue: "Navayu Gurgaon",
          options: APPOINTMENT_CENTRES,
        },
        { id: "doctorName", type: "text", label: "Doctor name" },
        { id: "specialty", type: "text", label: "Specialty", placeholder: "spine, knee…" },
        { id: "valueEstimate", type: "currency", label: "Est. value (₹)", defaultValue: 50000 },
        { id: "appointmentDate", type: "date", label: "Appointment date" },
        { id: "appointmentTime", type: "time", label: "Appointment time" },
        {
          id: "source",
          type: "select",
          label: "Lead source",
          required: true,
          options: [
            { value: "whatsapp", label: "WhatsApp" },
            { value: "google_forms", label: "Google Forms" },
            { value: "meta_ads", label: "Meta Ads" },
            { value: "website", label: "Website" },
            { value: "walk_in", label: "Walk-in" },
            { value: "phone", label: "Phone" },
            { value: "doctor_referral", label: "Doctor referral" },
            { value: "camp", label: "Health camp" },
          ],
        },
        { id: "notes", type: "textarea", label: "Notes", span: 2 },
      ],
    },
  ],
};

export const CRM_FOLLOWUP_SCHEMA: FormSchema = {
  id: "crm-followup",
  title: "Lead follow-up",
  sections: [
    {
      id: "followup",
      label: "Follow-up log",
      fields: [
        {
          id: "outcome",
          type: "select",
          label: "Outcome",
          required: true,
          options: [
            { value: "connected", label: "Connected" },
            { value: "callback", label: "Callback scheduled" },
            { value: "not_interested", label: "Not interested" },
            { value: "converted", label: "Converted" },
          ],
        },
        { id: "nextAction", type: "datetime", label: "Next action" },
        { id: "followupNotes", type: "textarea", label: "Notes", span: 2 },
      ],
    },
  ],
};
