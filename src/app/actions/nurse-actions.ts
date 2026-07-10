"use server";

import type { ConsentRecord, VitalsRecord } from "@/design-system/nurse-data";
import { requireModule } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/action-result";
import {
  claimEpisode,
  completeEpisode,
  completeSession,
  declineConsent,
  getNurseSnapshot,
  listNurseAuditLogs,
  presentConsent,
  saveNurseIpdNote,
  saveVitals,
  signConsent,
  startSession,
  updateEpisodeNotes,
  uploadConsent,
  verifyConsent,
} from "@/server/nurse";
import type { NurseSnapshot } from "@/server/nurse";

export async function getNurseSnapshotAction(): Promise<ActionResult<NurseSnapshot>> {
  return runAction(async () => {
    const ctx = await requireModule("nurse");
    return getNurseSnapshot(ctx);
  });
}

export async function claimEpisodeAction(visitId: string) {
  const ctx = await requireModule("nurse");
  return claimEpisode(ctx, visitId);
}

export async function saveVitalsAction(
  visitId: string,
  vitals: Omit<VitalsRecord, "visitId" | "recordedAt" | "recordedBy">,
) {
  const ctx = await requireModule("nurse");
  return saveVitals(ctx, visitId, vitals);
}

export async function presentConsentAction(visitId: string, consentId: string) {
  const ctx = await requireModule("nurse");
  return presentConsent(ctx, visitId, consentId);
}

export async function signConsentAction(
  visitId: string,
  consentId: string,
  data: {
    signatureDataUrl: string;
    signerName: string;
    signerRole?: ConsentRecord["signerRole"];
    witnessName?: string;
  },
) {
  const ctx = await requireModule("nurse");
  return signConsent(ctx, visitId, consentId, data);
}

export async function uploadConsentAction(
  visitId: string,
  consentId: string,
  data: { uploadDataUrl: string; uploadFileName: string; signerName: string },
) {
  const ctx = await requireModule("nurse");
  return uploadConsent(ctx, visitId, consentId, data);
}

export async function verifyConsentAction(visitId: string, consentId: string) {
  const ctx = await requireModule("nurse");
  return verifyConsent(ctx, visitId, consentId);
}

export async function declineConsentAction(visitId: string, consentId: string, reason: string) {
  const ctx = await requireModule("nurse");
  return declineConsent(ctx, visitId, consentId, reason);
}

export async function startSessionAction(visitId: string, bay: string) {
  const ctx = await requireModule("nurse");
  return startSession(ctx, visitId, bay);
}

export async function completeSessionAction(visitId: string, sessionId: string, notes?: string) {
  const ctx = await requireModule("nurse");
  return completeSession(ctx, visitId, sessionId, notes);
}

export async function completeEpisodeAction(visitId: string) {
  const ctx = await requireModule("nurse");
  return completeEpisode(ctx, visitId);
}

export async function updateEpisodeNotesAction(visitId: string, notes: string) {
  const ctx = await requireModule("nurse");
  return updateEpisodeNotes(ctx, visitId, notes);
}

export async function listNurseAuditLogsAction(input?: { limit?: number; cursor?: string }) {
  const ctx = await requireModule("nurse");
  return listNurseAuditLogs(ctx, input ?? {});
}

export async function saveNurseIpdNoteAction(visitId: string, content: string) {
  const ctx = await requireModule("nurse");
  return saveNurseIpdNote(ctx, visitId, content);
}
