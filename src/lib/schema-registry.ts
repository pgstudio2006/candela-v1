import type { FormDepartment } from "@/design-system/admin-data";
import {
  COUNSELLOR_FOLLOWUP_SCHEMA,
  COUNSELLOR_INTAKE_SCHEMA,
  COUNSELLOR_PACKAGE_SCHEMA,
} from "@/design-system/counsellor-schemas";
import {
  DOCTOR_DIAGNOSIS_SCHEMA,
  DOCTOR_EXAMINATION_SCHEMA,
  DOCTOR_HANDOFF_SCHEMA,
  DOCTOR_IPD_ROUND_SCHEMA,
  DOCTOR_TREATMENT_SCHEMA,
} from "@/design-system/doctor-schemas";
import { CRM_FOLLOWUP_SCHEMA, CRM_LEAD_CAPTURE_SCHEMA } from "@/design-system/crm-schemas";
import {
  APPOINTMENT_SCHEMA,
  BILLING_SCHEMA,
  CHECKIN_SCHEMA,
  JUNIOR_EXAM_SCHEMA,
  REGISTRATION_SCHEMA,
  type FormSchema,
  type SchemaField,
} from "@/design-system/frontdesk-schemas";
import { HR_LEAVE_REQUEST_SCHEMA, HR_ONBOARDING_SCHEMA } from "@/design-system/hr-schemas";
import {
  NURSE_CONSENT_NOTES_SCHEMA,
  NURSE_SCORES_SCHEMA,
  NURSE_SESSION_NOTES_SCHEMA,
  NURSE_VITALS_SCHEMA,
} from "@/design-system/nurse-schemas";
import { PHARMACY_DISPENSE_SCHEMA, PHARMACY_INTAKE_SCHEMA } from "@/design-system/pharmacy-schemas";
import { COUNTRIES, INDIA_COUNTRY } from "@/lib/india-locations";
import { otherDetailKey, parseMultiValue, selectionUsesOther } from "@/lib/schema-field-utils";

export const DOCTOR_FORM_SCHEMA_IDS = [
  "doctor-examination",
  "doctor-diagnosis",
  "doctor-treatment",
  "doctor-handoff",
  "doctor-ipd-round",
] as const;

export type DoctorFormSchemaId = (typeof DOCTOR_FORM_SCHEMA_IDS)[number];

export const FORM_SCHEMA_IDS = [
  "registration",
  "checkin",
  "billing",
  "appointment",
  "junior-exam",
] as const;

export type FormSchemaId = (typeof FORM_SCHEMA_IDS)[number];

export const NURSE_FORM_SCHEMA_IDS = [
  "nurse-vitals",
  "nurse-consent-notes",
  "nurse-session-notes",
  "nurse-scores",
] as const;

export type NurseFormSchemaId = (typeof NURSE_FORM_SCHEMA_IDS)[number];

export const COUNSELLOR_FORM_SCHEMA_IDS = [
  "counsellor-intake",
  "counsellor-followup",
  "counsellor-package",
] as const;

export type CounsellorFormSchemaId = (typeof COUNSELLOR_FORM_SCHEMA_IDS)[number];

export const PHARMACY_FORM_SCHEMA_IDS = ["pharmacy-dispense", "pharmacy-intake"] as const;

export type PharmacyFormSchemaId = (typeof PHARMACY_FORM_SCHEMA_IDS)[number];

export const CRM_FORM_SCHEMA_IDS = ["crm-lead-capture", "crm-followup"] as const;

export type CrmFormSchemaId = (typeof CRM_FORM_SCHEMA_IDS)[number];

export const HR_FORM_SCHEMA_IDS = ["hr-onboarding", "hr-leave-request"] as const;

export type HrFormSchemaId = (typeof HR_FORM_SCHEMA_IDS)[number];

export type AnyFormSchemaId =
  | FormSchemaId
  | DoctorFormSchemaId
  | NurseFormSchemaId
  | CounsellorFormSchemaId
  | PharmacyFormSchemaId
  | CrmFormSchemaId
  | HrFormSchemaId;

const DEFAULT_SCHEMAS: Record<FormSchemaId, FormSchema> = {
  registration: REGISTRATION_SCHEMA,
  checkin: CHECKIN_SCHEMA,
  billing: BILLING_SCHEMA,
  appointment: APPOINTMENT_SCHEMA,
  "junior-exam": JUNIOR_EXAM_SCHEMA,
};

const DOCTOR_DEFAULT_SCHEMAS: Record<DoctorFormSchemaId, FormSchema> = {
  "doctor-examination": DOCTOR_EXAMINATION_SCHEMA,
  "doctor-diagnosis": DOCTOR_DIAGNOSIS_SCHEMA,
  "doctor-treatment": DOCTOR_TREATMENT_SCHEMA,
  "doctor-handoff": DOCTOR_HANDOFF_SCHEMA,
  "doctor-ipd-round": DOCTOR_IPD_ROUND_SCHEMA,
};

const NURSE_DEFAULT_SCHEMAS: Record<NurseFormSchemaId, FormSchema> = {
  "nurse-vitals": NURSE_VITALS_SCHEMA,
  "nurse-consent-notes": NURSE_CONSENT_NOTES_SCHEMA,
  "nurse-session-notes": NURSE_SESSION_NOTES_SCHEMA,
  "nurse-scores": NURSE_SCORES_SCHEMA,
};

const COUNSELLOR_DEFAULT_SCHEMAS: Record<CounsellorFormSchemaId, FormSchema> = {
  "counsellor-intake": COUNSELLOR_INTAKE_SCHEMA,
  "counsellor-followup": COUNSELLOR_FOLLOWUP_SCHEMA,
  "counsellor-package": COUNSELLOR_PACKAGE_SCHEMA,
};

const PHARMACY_DEFAULT_SCHEMAS: Record<PharmacyFormSchemaId, FormSchema> = {
  "pharmacy-dispense": PHARMACY_DISPENSE_SCHEMA,
  "pharmacy-intake": PHARMACY_INTAKE_SCHEMA,
};

const CRM_DEFAULT_SCHEMAS: Record<CrmFormSchemaId, FormSchema> = {
  "crm-lead-capture": CRM_LEAD_CAPTURE_SCHEMA,
  "crm-followup": CRM_FOLLOWUP_SCHEMA,
};

const HR_DEFAULT_SCHEMAS: Record<HrFormSchemaId, FormSchema> = {
  "hr-onboarding": HR_ONBOARDING_SCHEMA,
  "hr-leave-request": HR_LEAVE_REQUEST_SCHEMA,
};

const ALL_DEFAULT_SCHEMAS: Record<string, FormSchema> = {
  ...DEFAULT_SCHEMAS,
  ...DOCTOR_DEFAULT_SCHEMAS,
  ...NURSE_DEFAULT_SCHEMAS,
  ...COUNSELLOR_DEFAULT_SCHEMAS,
  ...PHARMACY_DEFAULT_SCHEMAS,
  ...CRM_DEFAULT_SCHEMAS,
  ...HR_DEFAULT_SCHEMAS,
};

export const SCHEMA_DEPARTMENT: Record<string, FormDepartment> = {
  registration: "frontdesk",
  checkin: "frontdesk",
  billing: "frontdesk",
  appointment: "frontdesk",
  "junior-exam": "frontdesk",
  "doctor-examination": "doctor",
  "doctor-diagnosis": "doctor",
  "doctor-treatment": "doctor",
  "doctor-handoff": "doctor",
  "doctor-ipd-round": "doctor",
  "nurse-vitals": "nurse",
  "nurse-consent-notes": "nurse",
  "nurse-session-notes": "nurse",
  "nurse-scores": "nurse",
  "counsellor-intake": "counsellor",
  "counsellor-followup": "counsellor",
  "counsellor-package": "counsellor",
  "pharmacy-dispense": "pharmacy",
  "pharmacy-intake": "pharmacy",
  "crm-lead-capture": "crm",
  "crm-followup": "crm",
  "hr-onboarding": "hr",
  "hr-leave-request": "hr",
};

export type SchemaCatalogEntry = {
  id: string;
  label: string;
  department: FormDepartment;
};

export const SCHEMA_CATALOG: SchemaCatalogEntry[] = Object.entries(ALL_DEFAULT_SCHEMAS).map(
  ([id, schema]) => ({
    id,
    label: schema.title,
    department: SCHEMA_DEPARTMENT[id] ?? "admin",
  }),
);

export const SCHEMA_STORAGE_KEY = "candela-schema-overrides";
let schemaOverrides: Partial<Record<string, FormSchema>> = {};

export function getSchemaDepartment(schemaId: string): FormDepartment | null {
  return SCHEMA_DEPARTMENT[schemaId] ?? null;
}

export function listSchemasForDepartment(department: FormDepartment): SchemaCatalogEntry[] {
  return SCHEMA_CATALOG.filter((s) => s.department === department);
}

/** Render a subset of fields from a published schema (e.g. appointment notes only). */
export function subsetSchema(schema: FormSchema, fieldIds: string[]): FormSchema {
  const fields = schema.sections.flatMap((s) => s.fields).filter((f) => fieldIds.includes(f.id));
  return {
    id: schema.id,
    title: schema.title,
    sections: [{ id: "subset", label: "Details", fields }],
  };
}

export function getDefaultSchemaForId(id: string): FormSchema | null {
  const base = ALL_DEFAULT_SCHEMAS[id];
  return base ? structuredClone(base) : null;
}

/** Field ids across all sections (layout-only fields excluded). */
export function schemaFieldIds(schema: FormSchema): string[] {
  return schema.sections.flatMap((s) =>
    s.fields.filter((f) => f.type !== "section" && f.type !== "divider" && f.type !== "help").map((f) => f.id),
  );
}

const REGISTRATION_MARKER_FIELDS = new Set([
  "fullName",
  "phone",
  "alternatePhone",
  "visitType",
  "appointmentCentre",
  "referrer",
  "referrerName",
  "corporateId",
]);

/**
 * Detects overrides saved under the wrong schema key (e.g. registration payload on doctor-examination).
 * Caused by an earlier form-builder bug that published with the wrong schema id.
 */
export function isCorruptSchemaOverride(schemaId: string, override: FormSchema): boolean {
  const defaultSchema = ALL_DEFAULT_SCHEMAS[schemaId];
  if (!defaultSchema) return false;
  if (schemaId === "registration") return false;
  // CRM schemas legitimately capture lead/patient details with fullName, phone, etc.
  if (CRM_FORM_SCHEMA_IDS.includes(schemaId as CrmFormSchemaId)) return false;

  const overrideIds = schemaFieldIds(override);
  const registrationDefault = DEFAULT_SCHEMAS.registration;

  if (override.id && override.id !== schemaId) return true;
  if (override.title === registrationDefault.title) return true;

  // Registration-only field ids / sections copied to other schemas
  if (overrideIds.includes("fullName")) return true;
  if (override.sections.some((s) => s.id === "patient" || s.id === "visit" || s.id === "consent")) {
    return true;
  }

  const registrationMarkers = overrideIds.filter((id) => REGISTRATION_MARKER_FIELDS.has(id)).length;
  if (registrationMarkers >= 2) return true;

  const defaultIds = new Set(schemaFieldIds(defaultSchema));
  const overlap = overrideIds.filter((id) => defaultIds.has(id)).length;
  if (overrideIds.length >= 6 && overlap === 0) return true;

  // Module override must retain at least one defining field from its default schema
  const signature = schemaFieldIds(defaultSchema).slice(0, 2);
  if (overrideIds.length >= 4 && signature.length > 0 && !signature.some((id) => overrideIds.includes(id))) {
    return true;
  }

  return false;
}

export function corruptSchemaOverrideMessage(schemaId: string): string {
  const label = SCHEMA_CATALOG.find((e) => e.id === schemaId)?.label ?? schemaId;
  return `This ${label} form still looks like patient registration (wrong sections or fields). Click Reset to default, edit the correct form, then publish again.`;
}

const SEMANTIC_FIELD_ALIASES: Record<string, string[]> = {
  fullName: ["firstName", "lastName"],
  phone: ["mobile"],
};

function isEquivalentField(fieldId: string, existingIds: Set<string>): boolean {
  if (existingIds.has(fieldId)) return true;
  const aliases = SEMANTIC_FIELD_ALIASES[fieldId];
  if (aliases) return aliases.some((alias) => existingIds.has(alias));
  return false;
}

function mergeRegistrationOverride(override: FormSchema, defaultSchema: FormSchema): FormSchema {
  const matchedDefaultSectionIds = new Set<string>();
  const mergedSections = override.sections.map((overrideSection) => {
    const existingIds = new Set(overrideSection.fields.map((f) => f.id));

    // Find the default section that best matches this override section.
    let bestMatch: { defaultSection: (typeof defaultSchema.sections)[0] | null; overlap: number } = {
      defaultSection: null,
      overlap: 0,
    };
    for (const defaultSection of defaultSchema.sections) {
      const overlap = defaultSection.fields.filter((f) =>
        overrideSection.fields.some((of) => of.id === f.id || isEquivalentField(f.id, existingIds)),
      ).length;
      if (overlap > bestMatch.overlap) {
        bestMatch = { defaultSection, overlap };
      }
    }

    if (!bestMatch.defaultSection) return overrideSection;
    matchedDefaultSectionIds.add(bestMatch.defaultSection.id);

    const additionalFields = bestMatch.defaultSection.fields.filter((field) => {
      if (isEquivalentField(field.id, existingIds)) return false;
      existingIds.add(field.id);
      return true;
    });

    if (additionalFields.length === 0) return overrideSection;
    return { ...overrideSection, fields: [...overrideSection.fields, ...additionalFields] };
  });

  // Append any default sections that did not overlap with an override section.
  for (const defaultSection of defaultSchema.sections) {
    if (!matchedDefaultSectionIds.has(defaultSection.id)) {
      mergedSections.push(defaultSection);
    }
  }

  return { ...override, sections: mergedSections };
}

function normalizeCountryField(schema: FormSchema): FormSchema {
  return {
    ...schema,
    sections: schema.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) =>
        field.id === "country" && field.type === "select"
          ? { ...field, options: COUNTRIES, defaultValue: field.defaultValue ?? INDIA_COUNTRY }
          : field,
      ),
    })),
  };
}

/**
 * Fields the prescription PDF renders as vitals / Yes-No checkboxes. They must
 * always exist on the doctor examination form, even if an admin published a
 * custom form override that dropped them.
 */
const PRESCRIPTION_SCREENING_FIELDS: SchemaField[] = [
  { id: "vitalsBp", type: "text", label: "Blood pressure", placeholder: "120/80" },
  { id: "vitalsPulse", type: "number", label: "Pulse / PR (bpm)" },
  { id: "allergyKnown", type: "radio", label: "Known drug allergy", defaultValue: "No", span: 2, options: [{ value: "No", label: "No" }, { value: "Yes", label: "Yes" }] },
  { id: "allergies", type: "text", label: "Allergy details (if yes)", placeholder: "e.g. Penicillin — or NKDA" },
  { id: "diabetes", type: "radio", label: "Diabetes", defaultValue: "No", options: [{ value: "No", label: "No" }, { value: "Yes", label: "Yes" }] },
  { id: "thyroidDisorder", type: "radio", label: "Thyroid disorder", defaultValue: "No", options: [{ value: "No", label: "No" }, { value: "Yes", label: "Yes" }] },
  { id: "hypertension", type: "radio", label: "Hypertension", defaultValue: "No", options: [{ value: "No", label: "No" }, { value: "Yes", label: "Yes" }] },
];

function ensurePrescriptionScreeningFields(schema: FormSchema): FormSchema {
  if (schema.id !== "doctor-examination") return schema;
  const existing = new Set(schemaFieldIds(schema));
  const missing = PRESCRIPTION_SCREENING_FIELDS.filter((f) => !existing.has(f.id));
  if (missing.length === 0) return schema;
  const sections = schema.sections.length
    ? [...schema.sections]
    : [{ id: "complaint", label: "Chief complaint & history", fields: [] as SchemaField[] }];
  sections[0] = { ...sections[0], fields: [...sections[0].fields, ...missing] };
  return { ...schema, sections };
}

/**
 * Registration is age-only: the age number prints on prescriptions and
 * records. Published form overrides from the form builder may still carry a
 * date-of-birth field and/or an age field under a mismatched id (the builder
 * regenerates ids), which made the submit guard see an empty age. Force the
 * shape: drop DOB, guarantee a required `age` number field.
 */
function normalizeRegistrationAgeField(schema: FormSchema): FormSchema {
  if (schema.id !== "registration") return schema;
  const sections = schema.sections.map((section) => ({ ...section, fields: [...section.fields] }));

  // 1. Drop DOB (by id or label) from every section.
  for (const section of sections) {
    section.fields = section.fields.filter(
      (f) => f.id !== "dob" && !/date\s*of\s*birth/i.test(f.label ?? ""),
    );
  }

  // 2. Guarantee an `age` field: reuse an existing age-like field if the
  //    override renamed its id, otherwise add one. Every other age-like
  //    duplicate (override "Age (if DOB unknown)" + merged default "Age")
  //    is removed so exactly one age field is rendered.
  const isAgeLike = (f: SchemaField) =>
    (f.id !== "age" && /\bage\b/i.test(f.id)) || /^(patient\s*)?age(\s*\(.*)?$/i.test((f.label ?? "").trim());
  const allFields = sections.flatMap((s) => s.fields);
  let ageField = allFields.find((f) => f.id === "age");
  if (!ageField) {
    ageField = allFields.find(isAgeLike);
    if (ageField) ageField.id = "age";
  }
  for (const section of sections) {
    section.fields = section.fields.filter((f) => f === ageField || f.id === "age" || !isAgeLike(f));
  }
  if (ageField) {
    ageField.type = "number";
    ageField.label = "Age";
    ageField.required = true;
    if (ageField.hint) delete ageField.hint;
    ageField.placeholder = ageField.placeholder || "e.g. 35";
  } else {
    sections[0] = {
      ...sections[0],
      fields: [
        ...sections[0].fields,
        { id: "age", type: "number", label: "Age", required: true, placeholder: "e.g. 35", hint: "In years — printed on prescriptions and patient records" },
      ],
    };
  }
  return { ...schema, sections };
}

export function getAnyFormSchema(id: string): FormSchema {
  const override = schemaOverrides[id];
  const fallback = ALL_DEFAULT_SCHEMAS[id];
  if (!fallback && !override) {
    throw new Error(`Unknown form schema: ${id}`);
  }
  if (override && isCorruptSchemaOverride(id, override)) {
    const schema = structuredClone(fallback!);
    schema.id = id;
    return normalizeCountryField(normalizeRegistrationAgeField(schema));
  }
  const base = structuredClone(fallback!);
  const overrideClone = override ? structuredClone(override) : null;
  const schema = id === "registration" && overrideClone
    ? mergeRegistrationOverride(overrideClone, base)
    : overrideClone ?? base;
  schema.id = id;
  return normalizeCountryField(normalizeRegistrationAgeField(ensurePrescriptionScreeningFields(schema)));
}

export function getDefaultDoctorSchema(id: DoctorFormSchemaId): FormSchema {
  return structuredClone(DOCTOR_DEFAULT_SCHEMAS[id]);
}

export function getDoctorFormSchema(id: DoctorFormSchemaId): FormSchema {
  return getAnyFormSchema(id);
}

export function listAllFormSchemas(): FormSchema[] {
  return SCHEMA_CATALOG.map((entry) => getAnyFormSchema(entry.id));
}

export function saveAnyFormSchema(schema: FormSchema) {
  schemaOverrides[schema.id] = structuredClone(schema);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("candela-schema-updated", { detail: { id: schema.id } }));
  }
}

export function resetAnyFormSchema(id: string) {
  delete schemaOverrides[id];
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("candela-schema-updated", { detail: { id } }));
  }
}

export function getDefaultSchema(id: FormSchemaId): FormSchema {
  return structuredClone(DEFAULT_SCHEMAS[id]);
}

export function listFormSchemas(): FormSchema[] {
  return FORM_SCHEMA_IDS.map((id) => getFormSchema(id));
}

export function getFormSchema(id: FormSchemaId): FormSchema {
  return getAnyFormSchema(id);
}

export function saveFormSchema(schema: FormSchema) {
  saveAnyFormSchema(schema);
}

export function resetFormSchema(id: FormSchemaId) {
  resetAnyFormSchema(id);
}

export function resetAllFormSchemas() {
  schemaOverrides = {};
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("candela-schema-updated"));
  }
}

export function setSchemaOverrideCache(overrides: Partial<Record<string, FormSchema>>) {
  schemaOverrides = { ...overrides };
}

export function validateFormValues(
  schema: FormSchema,
  values: Record<string, string | number | boolean>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.type === "section" || field.type === "divider" || field.type === "help" || field.type === "formula" || field.readOnly) continue;
      const value = values[field.id];

      if (field.type === "toggle") {
        if (field.required && value !== true) errors[field.id] = `${field.label} is required`;
        continue;
      }

      if (field.type === "multiselect" || (field.type === "checkbox" && field.options?.length)) {
        if (field.required && parseMultiValue(value).length === 0) {
          errors[field.id] = `${field.label} is required`;
        }
      } else if (field.type === "checkbox") {
        if (field.required && value !== true) errors[field.id] = `${field.label} is required`;
      } else if (field.required) {
        const empty = value === undefined || value === null || value === "";
        if (empty) errors[field.id] = `${field.label} is required`;
      }

      if (selectionUsesOther(field, value)) {
        const detail = values[otherDetailKey(field.id)];
        const detailEmpty = detail === undefined || detail === null || String(detail).trim() === "";
        if (detailEmpty) errors[otherDetailKey(field.id)] = "Please enter details for Other";
      }
    }
  }
  return errors;
}

export function newFieldId(label: string, existing: SchemaField[]): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24) || "field";
  let id = base;
  let n = 1;
  while (existing.some((f) => f.id === id)) {
    id = `${base}_${n++}`;
  }
  return id;
}
