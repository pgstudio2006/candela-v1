import { z } from "zod";
import type { ConsentRecord, NursingEpisode } from "@/design-system/nurse-data";
import { requiredConsentsComplete } from "@/design-system/nurse-data";
import { ServerActionError } from "@/server/errors";

export const vitalsInputSchema = z.object({
  bpSystolic: z.number().min(60).max(260),
  bpDiastolic: z.number().min(40).max(180),
  pulse: z.number().min(30).max(220),
  spo2: z.number().min(50).max(100),
  temperature: z.number().min(32).max(43),
  weight: z.number().min(1).max(300).optional(),
  painScore: z.number().min(0).max(10),
  allergies: z.string().max(500),
  redFlags: z.string().max(1000),
  nursingNotes: z.string().max(2000),
});

export const signConsentSchema = z.object({
  signatureDataUrl: z.string().min(20),
  signerName: z.string().min(2).max(120),
  signerRole: z.enum(["patient", "guardian", "witness"]).optional(),
  witnessName: z.string().max(120).optional(),
});

export const uploadConsentSchema = z.object({
  uploadDataUrl: z.string().min(20),
  uploadFileName: z.string().min(1).max(200),
  signerName: z.string().min(2).max(120),
});

export const startSessionSchema = z.object({
  bay: z.string().max(80).optional(),
});

export function validateSaveVitals(vitals: z.infer<typeof vitalsInputSchema>) {
  const parsed = vitalsInputSchema.safeParse(vitals);
  if (!parsed.success) {
    throw new ServerActionError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid vitals");
  }
  if (parsed.data.bpSystolic <= parsed.data.bpDiastolic) {
    throw new ServerActionError("VALIDATION", "Systolic BP must be greater than diastolic.");
  }
  return parsed.data;
}

export function validateSignConsent(data: z.infer<typeof signConsentSchema>, treatmentPath: string) {
  const parsed = signConsentSchema.safeParse(data);
  if (!parsed.success) {
    throw new ServerActionError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid consent signature");
  }
  if (treatmentPath === "ipd" && !parsed.data.witnessName?.trim()) {
    throw new ServerActionError("VALIDATION", "Witness nurse name is required for IPD consent signatures.");
  }
  return parsed.data;
}

export function validateUploadConsent(data: z.infer<typeof uploadConsentSchema>) {
  const parsed = uploadConsentSchema.safeParse(data);
  if (!parsed.success) {
    throw new ServerActionError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid consent upload");
  }
  return parsed.data;
}

export function validateStartSession(episode: NursingEpisode, consents: ConsentRecord[], bay?: string) {
  const parsed = startSessionSchema.safeParse({ bay });
  if (!parsed.success) {
    throw new ServerActionError("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid bay");
  }
  if (!episode.vitals) {
    throw new ServerActionError("VALIDATION", "Vitals must be recorded before starting treatment.");
  }
  if (!requiredConsentsComplete(consents)) {
    throw new ServerActionError("VALIDATION", "All required consents must be verified before treatment.");
  }
  const scheduled = episode.sessions.find((s) => s.status === "scheduled");
  if (!scheduled) {
    throw new ServerActionError("VALIDATION", "No scheduled session available to start.");
  }
  return { bay: parsed.data.bay, session: scheduled };
}

export function validateCompleteEpisode(episode: NursingEpisode) {
  const inProgress = episode.sessions.some((s) => s.status === "in_progress");
  if (inProgress) {
    throw new ServerActionError("VALIDATION", "Complete the active session before closing the episode.");
  }
}
