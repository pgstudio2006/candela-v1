import { z } from "zod";
import { ServerActionError } from "@/server/errors";

export const phoneSchema = z
  .string()
  .min(10, "Phone must be at least 10 digits.")
  .max(20);

export const leadPartialSchema = z.object({
  fullName: z.string().min(2).max(120),
  phone: phoneSchema,
  alternatePhone: z.string().max(20).optional(),
  email: z.string().max(120).optional(),
  age: z.number().int().min(0).max(120).optional(),
  dob: z.string().max(30).optional(),
  gender: z.string().max(20).optional(),
  city: z.string().max(80).optional(),
  district: z.string().max(80).optional(),
  state: z.string().max(80).optional(),
  country: z.string().max(80).optional(),
  houseNumber: z.string().max(80).optional(),
  street: z.string().max(120).optional(),
  locality: z.string().max(120).optional(),
  landmark: z.string().max(120).optional(),
  address: z.string().max(500).optional(),
  pincode: z.string().max(20).optional(),
  doctorName: z.string().max(120).optional(),
  appointmentDate: z.string().max(30).optional(),
  appointmentTime: z.string().max(20).optional(),
  appointmentCentre: z.string().max(120).optional(),
  source: z.string().min(1),
  sourceDetail: z.string().max(200).optional(),
  integrationId: z.string().optional(),
  specialty: z.string().max(80).optional(),
  valueEstimate: z.number().min(0).max(50_000_000).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(5000).optional(),
  lostReason: z.string().max(500).optional(),
  stageId: z.string().optional(),
  assigneeId: z.string().optional(),
  formData: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const followUpSchema = z.object({
  leadId: z.string().min(1),
  assigneeId: z.string().min(1),
  scheduledAt: z.string().min(1),
  channel: z.enum(["call", "whatsapp", "email"]),
  notes: z.string().max(2000).optional(),
  status: z.enum(["pending", "done", "missed"]).optional(),
});

export const inboundLeadSchema = z.object({
  name: z.string().min(2).max(120),
  phone: phoneSchema,
  specialty: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
  email: z.string().email().optional(),
});

export function validateLeadPartial(input: unknown) {
  const parsed = leadPartialSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServerActionError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid lead data.");
  }
  return parsed.data;
}

export function validateFollowUpInput(input: unknown) {
  const parsed = followUpSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServerActionError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid follow-up.");
  }
  return parsed.data;
}

export function validateInboundLead(input: unknown) {
  const parsed = inboundLeadSchema.safeParse(input);
  if (!parsed.success) {
    throw new ServerActionError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid inbound lead.");
  }
  return parsed.data;
}

export function validateOutcome(outcome: string) {
  const trimmed = outcome.trim();
  if (trimmed.length < 2) {
    throw new ServerActionError("VALIDATION", "Outcome must be at least 2 characters.");
  }
  return trimmed;
}

export function validateRuleWeights(weights: Record<string, number>, agentIds: string[]) {
  if (!agentIds.length) {
    throw new ServerActionError("VALIDATION", "Select at least one agent for the rule.");
  }
  const sum = agentIds.reduce((s, id) => s + (weights[id] ?? 0), 0);
  if (sum !== 100) {
    throw new ServerActionError("VALIDATION", `Percentage weights must total 100% (currently ${sum}%).`);
  }
}
