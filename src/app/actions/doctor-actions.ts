"use server";

import type { DoctorTemplate, PrescriptionLine, TreatmentMode } from "@/design-system/doctor-data";
import type { DocumentTemplate } from "@/design-system/document-templates";
import { requireAnyModule, requireModule } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/action-result";
import { prisma } from "@/lib/prisma";
import { resolveDoctorIdForContext } from "@/server/clinical/roster";
import {
  addDocumentTemplate,
  completeConsultation,
  createDoctorTemplate,
  deleteDoctorTemplate,
  getDoctorSnapshot,
  getIpdRoundHistory,
  listDoctorAuditLogs,
  listDocumentTemplates,
  deleteDocumentTemplate,
  saveConsultSection,
  saveDocumentTemplate,
  saveIpdRound,
  setPrescription,
  startConsultation,
  updateConsultation,
  updateDoctorTemplate,
} from "@/server/doctor";
import type { DoctorSnapshot } from "@/server/doctor";

export async function getDoctorSnapshotAction(
  activeDoctorId?: string,
): Promise<ActionResult<DoctorSnapshot>> {
  return runAction(async () => {
    const ctx = await requireModule("doctor");
    const doctorId = activeDoctorId ?? (await resolveDoctorIdForContext(ctx));
    return getDoctorSnapshot(ctx, doctorId);
  });
}

export async function startConsultationAction(visitId: string) {
  return runAction(async () => {
    const ctx = await requireModule("doctor");
    return startConsultation(ctx, visitId);
  });
}

export async function completeConsultationAction(
  visitId: string,
  opts: {
    treatmentMode: TreatmentMode;
    recommendCounsellor: boolean;
    skipCounsellor: boolean;
    handoff: Record<string, string | number | boolean>;
    sendWhatsapp: boolean;
  },
): Promise<ActionResult<{ visitId: string }>> {
  return runAction(async () => {
    const ctx = await requireModule("doctor");
    await completeConsultation(ctx, visitId, opts);
    return { visitId };
  });
}

export async function updateConsultationAction(visitId: string, patch: Record<string, unknown>) {
  const ctx = await requireModule("doctor");
  return updateConsultation(ctx, visitId, patch as Parameters<typeof updateConsultation>[2]);
}

export async function saveConsultSectionAction(
  visitId: string,
  section: "examination" | "diagnosis" | "treatment",
  data: Record<string, string | number | boolean>,
) {
  const ctx = await requireModule("doctor");
  return saveConsultSection(ctx, visitId, section, data);
}

export async function setPrescriptionAction(visitId: string, lines: PrescriptionLine[]) {
  const ctx = await requireModule("doctor");
  return setPrescription(ctx, visitId, lines);
}

export async function createDoctorTemplateAction(doctorId: string, tpl: Omit<DoctorTemplate, "id" | "doctorId">) {
  const ctx = await requireModule("doctor");
  return createDoctorTemplate(ctx, doctorId, tpl);
}

export async function updateDoctorTemplateAction(id: string, patch: Partial<DoctorTemplate>) {
  const ctx = await requireModule("doctor");
  return updateDoctorTemplate(ctx, id, patch);
}

export async function deleteDoctorTemplateAction(id: string) {
  const ctx = await requireModule("doctor");
  return deleteDoctorTemplate(ctx, id);
}

export async function saveIpdRoundAction(
  ipdId: string,
  note: Record<string, string | number | boolean>,
  medicationLines?: import("@/design-system/doctor-data").PrescriptionLine[],
) {
  const ctx = await requireModule("doctor");
  return saveIpdRound(ctx, ipdId, note, medicationLines);
}

export async function getIpdRoundHistoryAction(ipdId: string) {
  const ctx = await requireModule("doctor");
  return getIpdRoundHistory(ctx, ipdId);
}

export async function getIpdRoundHistoryForVisitAction(visitId: string) {
  return runAction(async () => {
    const ctx = await requireAnyModule("doctor", "nurse", "admin");
    const admission = await prisma.ipdAdmission.findFirst({
      where: { visitId, tenantId: ctx.tenantId, branchId: ctx.branchId },
      select: { id: true },
    });
    if (!admission) return [];
    return getIpdRoundHistory(ctx, admission.id);
  });
}

export async function listDoctorAuditLogsAction(input?: { limit?: number; cursor?: string }) {
  const ctx = await requireModule("doctor");
  return listDoctorAuditLogs(ctx, input ?? {});
}

export async function listDocumentTemplatesAction(): Promise<ActionResult<DocumentTemplate[]>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "doctor", "frontdesk");
    return listDocumentTemplates(ctx);
  });
}

export async function deleteDocumentTemplateAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "doctor");
    return deleteDocumentTemplate(ctx, id);
  });
}

export async function addDocumentTemplateAction(kind: DocumentTemplate["kind"], label: string, description: string) {
  const ctx = await requireModule("doctor");
  return addDocumentTemplate(ctx, kind, label, description);
}

export async function saveDocumentTemplateAction(template: DocumentTemplate): Promise<ActionResult<DocumentTemplate>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "doctor");
    return saveDocumentTemplate(ctx, template);
  });
}
