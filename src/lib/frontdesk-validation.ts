import { z } from "zod";
import { ageFromDob } from "@/lib/frontdesk-workflow";
import { ServerActionError } from "@/server/errors";

const phoneSchema = z
  .string()
  .min(10, "Mobile number must be at least 10 digits")
  .max(20, "Mobile number is too long");

function asString(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeGender(value: unknown): "M" | "F" | "O" {
  const raw = asString(value).toLowerCase();
  if (raw === "m" || raw === "male") return "M";
  if (raw === "f" || raw === "female") return "F";
  if (raw === "o" || raw === "other") return "O";
  return "O";
}

/** Align dynamic form-builder payloads with server registration expectations. */
export function normalizeRegisterPatientInput(
  data: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> {
  let fullName = asString(data.fullName ?? data.name);
  const firstName = asString(data.firstName ?? data.first_name);
  const lastName = asString(data.lastName ?? data.last_name);

  if (!fullName && (firstName || lastName)) {
    fullName = `${firstName} ${lastName}`.trim();
  }

  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const firstFromFull = nameParts[0] ?? "";
  const lastFromFull = nameParts.slice(1).join(" ");

  const normalizedFirstName = firstName || firstFromFull;
  const normalizedLastName = lastName || lastFromFull;

  return {
    ...data,
    fullName: fullName || `${normalizedFirstName} ${normalizedLastName}`.trim(),
    firstName: normalizedFirstName,
    lastName: normalizedLastName,
    phone: asString(data.phone ?? data.mobile),
    alternatePhone: asString(data.alternatePhone ?? data.alternate_phone),
    email: data.email === undefined ? "" : asString(data.email),
    dob: asString(data.dob ?? data.dateOfBirth),
    gender: normalizeGender(data.gender),
    department: asString(data.department),
    state: asString(data.state),
    district: asString(data.district),
    city: asString(data.city),
    society: asString(data.society),
    address: asString(data.address),
    houseNumber: asString(data.houseNumber),
    street: asString(data.street),
    locality: asString(data.locality),
    landmark: asString(data.landmark),
    country: asString(data.country) || "India",
    appointmentCentre: asString(data.appointmentCentre),
    age:
      data.age === undefined || data.age === ""
        ? (asString(data.dob) ? ageFromDob(asString(data.dob)) : 0)
        : Number(data.age),
  };
}

export const registerPatientSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().optional().default(""),
  phone: phoneSchema,
  email: z.union([z.string().email("Invalid email"), z.literal("")]).optional().default(""),
  dob: z.string().optional().default(""),
  age: z.coerce.number().min(0).max(120).optional(),
  gender: z.enum(["M", "F", "O"]),
  department: z.string().min(1, "Department is required"),
});

export const checkInSchema = z.object({
  uhid: z.string().trim().min(1, "Patient UHID is required"),
  department: z.string().min(1, "Department is required"),
  doctor: z.string().min(1, "Doctor is required"),
});

export const billingSchema = z.object({
  template: z.string().optional(),
  paymentScope: z.enum(["full", "partial", "defer"]),
  amount: z.coerce.number().min(0, "Amount cannot be negative"),
  discount: z.coerce.number().min(0).optional(),
  collectedAmount: z.coerce.number().min(0).optional(),
  mode: z.string().min(1, "Payment mode is required"),
  customLine: z.string().optional(),
});

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full name",
  firstName: "First name",
  lastName: "Last name",
  phone: "Mobile",
  email: "Email",
  dob: "Date of birth",
  gender: "Gender",
  department: "Department",
  state: "State",
  district: "District",
  city: "City",
};

function validationMessage(issue: z.ZodIssue): string {
  if (issue.message && !issue.message.startsWith("Invalid input")) return issue.message;
  const field = issue.path[0];
  if (typeof field === "string" && FIELD_LABELS[field]) {
    return `${FIELD_LABELS[field]} is required`;
  }
  return issue.message || "Invalid input";
}

export function validateFrontdeskInput<T extends z.ZodType>(
  schema: T,
  data: Record<string, string | number | boolean>,
): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ServerActionError("VALIDATION", validationMessage(first));
  }
  return parsed.data;
}
