"use server";

import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireAuth } from "@/server/auth";
import { branchScope } from "@/server/tenancy";
import { writePlatformAudit } from "@/server/platform-audit";

export type ConsentListItem = {
  id: string;
  visitId: string | null;
  label: string;
  status: string;
  signedAt: string | null;
  createdAt: string;
};

export async function listConsentsAction(patientId: string): Promise<ActionResult<ConsentListItem[]>> {
  return runAction(async () => {
    await requireAuth();
    const rows = await prisma.consent.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      visitId: r.visitId,
      label: r.label,
      status: r.status,
      signedAt: r.signedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

export async function createConsentAction(payload: {
  patientId: string;
  visitId?: string;
  label: string;
  required?: boolean;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireAuth();
    const scope = branchScope(ctx);
    const id = createId("consent");
    await prisma.consent.create({
      data: {
        id,
        ...scope,
        patientId: payload.patientId,
        visitId: payload.visitId ?? null,
        templateId: "general",
        templateVersion: "1",
        label: payload.label,
        status: "pending",
        required: payload.required ?? false,
        captureMode: "manual",
        signerRole: "patient",
      },
    });
    await writePlatformAudit({
      ctx,
      actor: ctx.userId ?? "system",
      actorRole: ctx.role ?? "unknown",
      module: "consent",
      action: "consent_created",
      entityType: "consent",
      entityId: id,
      summary: `Consent created for patient ${payload.patientId}: ${payload.label}`,
    }).catch(() => {});
    return { id };
  });
}

export async function signConsentAction(id: string, payload: { signerName: string; signatureDataUrl?: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requireAuth();
    await prisma.consent.update({
      where: { id },
      data: {
        status: "signed",
        signerName: payload.signerName,
        signedAt: new Date(),
        consentData: payload.signatureDataUrl ? { signature: payload.signatureDataUrl } : undefined,
      },
    });
    await writePlatformAudit({
      ctx,
      actor: ctx.userId ?? "system",
      actorRole: ctx.role ?? "unknown",
      module: "consent",
      action: "consent_signed",
      entityType: "consent",
      entityId: id,
      summary: `Consent signed by ${payload.signerName}`,
    }).catch(() => {});
  });
}

export async function deleteConsentAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    await requireAuth();
    await prisma.consent.delete({ where: { id } });
  });
}
