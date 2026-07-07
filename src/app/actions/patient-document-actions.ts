"use server";

import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireAuth } from "@/server/auth";
import { branchScope } from "@/server/tenancy";
import { writePlatformAudit } from "@/server/platform-audit";

export type PatientDocumentListItem = {
  id: string;
  patientId: string;
  visitId: string | null;
  category: string;
  label: string | null;
  fileName: string;
  mimeType: string | null;
  size: number | null;
  uploadedBy: string | null;
  uploadedAt: string;
};

export async function listPatientDocumentsAction(
  patientId: string,
  category?: string,
): Promise<ActionResult<PatientDocumentListItem[]>> {
  return runAction(async () => {
    await requireAuth();
    const rows = await prisma.patientDocument.findMany({
      where: { patientId, ...(category ? { category } : {}) },
      orderBy: { uploadedAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      patientId: r.patientId,
      visitId: r.visitId,
      category: r.category,
      label: r.label,
      fileName: r.fileName,
      mimeType: r.mimeType,
      size: r.size,
      uploadedBy: r.uploadedBy,
      uploadedAt: r.uploadedAt.toISOString(),
    }));
  });
}

export async function getPatientDocumentAction(id: string): Promise<ActionResult<{ fileUrl: string; fileName: string; mimeType: string | null } | null>> {
  return runAction(async () => {
    await requireAuth();
    const row = await prisma.patientDocument.findUnique({
      where: { id },
      select: { fileUrl: true, fileName: true, mimeType: true },
    });
    return row;
  });
}

export async function uploadPatientDocumentAction(payload: {
  patientId: string;
  visitId?: string;
  category: string;
  label?: string;
  fileName: string;
  mimeType?: string;
  size?: number;
  fileDataUrl: string;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireAuth();
    const scope = branchScope(ctx);
    const id = createId("doc");
    await prisma.patientDocument.create({
      data: {
        id,
        ...scope,
        patientId: payload.patientId,
        visitId: payload.visitId ?? null,
        category: payload.category,
        label: payload.label ?? null,
        fileName: payload.fileName,
        mimeType: payload.mimeType ?? null,
        size: payload.size ?? null,
        fileUrl: payload.fileDataUrl,
        uploadedBy: ctx.userId ?? null,
      },
    });
    await writePlatformAudit({
      ctx,
      actor: ctx.userId ?? "system",
      actorRole: ctx.role ?? "unknown",
      module: "patient-documents",
      action: "document_uploaded",
      entityType: "patient_document",
      entityId: id,
      summary: `Uploaded ${payload.category} document for patient ${payload.patientId}`,
    }).catch(() => {});
    return { id };
  });
}

export async function deletePatientDocumentAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    await requireAuth();
    await prisma.patientDocument.delete({ where: { id } });
  });
}
