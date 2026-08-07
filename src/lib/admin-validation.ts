import { z } from "zod";
import { ServerActionError } from "@/server/errors";

export const staffInputSchema = z
  .object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(120),
    phone: z.string().min(6).max(20),
    role: z.string().min(1),
    departmentIds: z.array(z.string()).default([]),
    branchId: z.string().min(1),
    licenseNo: z.string().max(40).optional(),
    degree: z.string().max(120).optional(),
    designation: z.string().max(120).optional(),
    signature: z.string().max(500_000).optional(),
    onDuty: z.boolean(),
    joinedAt: z.string().min(1),
  })
  .superRefine((val, ctx) => {
    const needsDept = val.role === "doctor" || val.role === "nurse";
    if (needsDept && val.departmentIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Assign at least one department for clinical staff.",
        path: ["departmentIds"],
      });
    }
  });

export const departmentInputSchema = z.object({
  label: z.string().min(2).max(80),
  headStaffId: z.string().optional(),
  doctorIds: z.array(z.string()).optional(),
  defaultPackageIds: z.array(z.string()).optional(),
  revenuePolicyId: z.string().optional(),
  bays: z.array(z.string()).optional(),
  active: z.boolean(),
});

export const expenseInputSchema = z.object({
  date: z.string().min(1),
  vendor: z.string().min(1).max(120),
  category: z.string().min(1).max(80),
  departmentId: z.string().min(1),
  amount: z.number().min(0).max(100_000_000),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  notes: z.string().max(500).optional(),
});

export const mrdRequestInputSchema = z.object({
  patientName: z.string().min(2).max(120),
  uhid: z.string().min(1).max(40),
  requestType: z.string().min(1).max(80),
  slaDue: z.string().min(1),
  documents: z.array(z.string()).optional(),
});

export function validateStaffInput(input: unknown) {
  const parsed = staffInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServerActionError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid staff data.");
  }
  return parsed.data;
}

export function validateDepartmentInput(input: unknown) {
  const parsed = departmentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServerActionError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid department data.");
  }
  return parsed.data;
}

export function validateExpenseInput(input: unknown) {
  const parsed = expenseInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServerActionError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid expense data.");
  }
  return parsed.data;
}

export function validateMrdRequestInput(input: unknown) {
  const parsed = mrdRequestInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServerActionError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid MRD request.");
  }
  return parsed.data;
}

export function validateAdminPassword(password: string) {
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    throw new ServerActionError("VALIDATION", "Password must be at least 8 characters.");
  }
  return trimmed;
}
