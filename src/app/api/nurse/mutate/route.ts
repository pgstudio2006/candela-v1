import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireModule } from "@/server/auth";
import { serializeForClient } from "@/server/serialize";
import { throwIfPrismaError } from "@/server/prisma-errors";
import { ServerActionError } from "@/server/errors";
import {
  claimEpisode,
  completeEpisode,
  completeSession,
  createNurseTask,
  declineConsent,
  presentConsent,
  saveDischargeSummary,
  saveVitals,
  signConsent,
  startSession,
  updateEpisodeNotes,
  updateNurseTaskStatus,
  uploadConsent,
  verifyConsent,
} from "@/server/nurse";
import type { ConsentRecord, DischargeSummary, VitalsRecord } from "@/design-system/nurse-data";

type ActionBody = {
  op: string;
  visitId?: string;
  consentId?: string;
  vitals?: Omit<VitalsRecord, "visitId" | "recordedAt" | "recordedBy">;
  signData?: {
    signatureDataUrl: string;
    signerName: string;
    signerRole?: ConsentRecord["signerRole"];
    witnessName?: string;
  };
  uploadData?: { uploadDataUrl: string; uploadFileName: string; signerName: string };
  reason?: string;
  bay?: string;
  sessionId?: string;
  notes?: string;
  values?: Record<string, unknown>;
  title?: string;
  assignedBy?: string;
  taskId?: string;
  status?: "pending" | "in_progress" | "completed";
  summary?: Omit<DischargeSummary, "preparedBy" | "preparedAt">;
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  let body: ActionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  try {
    const ctx = await requireModule("nurse");
    const { op } = body;
    let result: unknown;

    switch (op) {
      case "claimEpisode":
        result = await claimEpisode(ctx, body.visitId!);
        break;
      case "saveVitals":
        result = await saveVitals(ctx, body.visitId!, body.vitals!);
        break;
      case "presentConsent":
        result = await presentConsent(ctx, body.visitId!, body.consentId!);
        break;
      case "signConsent":
        result = await signConsent(ctx, body.visitId!, body.consentId!, body.signData!);
        break;
      case "uploadConsent":
        result = await uploadConsent(ctx, body.visitId!, body.consentId!, body.uploadData!);
        break;
      case "verifyConsent":
        result = await verifyConsent(ctx, body.visitId!, body.consentId!);
        break;
      case "declineConsent":
        result = await declineConsent(ctx, body.visitId!, body.consentId!, body.reason!);
        break;
      case "startSession":
        result = await startSession(ctx, body.visitId!, body.bay!, body.notes);
        break;
      case "completeSession":
        result = await completeSession(
          ctx,
          body.visitId!,
          body.sessionId!,
          body.values ?? (body.notes ? { sessionNotes: body.notes } : undefined),
        );
        break;
      case "completeEpisode":
        result = await completeEpisode(ctx, body.visitId!);
        break;
      case "updateEpisodeNotes":
        result = await updateEpisodeNotes(ctx, body.visitId!, body.notes!);
        break;
      case "createNurseTask":
        result = await createNurseTask(ctx, body.visitId!, { title: body.title!, assignedBy: body.assignedBy });
        break;
      case "updateNurseTaskStatus":
        result = await updateNurseTaskStatus(ctx, body.visitId!, body.taskId!, body.status!, body.notes);
        break;
      case "saveDischargeSummary":
        result = await saveDischargeSummary(ctx, body.visitId!, body.summary!);
        break;
      default:
        return NextResponse.json({ ok: false, error: `Unknown operation: ${op}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: serializeForClient(result) });
  } catch (error) {
    try {
      throwIfPrismaError(error);
    } catch (mapped) {
      if (mapped instanceof ServerActionError) {
        return NextResponse.json({ ok: false, error: mapped.message }, { status: 400 });
      }
    }
    if (error instanceof ServerActionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : "Something went wrong.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
