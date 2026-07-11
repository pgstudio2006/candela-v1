"use server";

import type { IpdAdmissionInput, IpdAdmissionStatus, IpdCartItem } from "@/design-system/ipd-data";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireAnyModule, requireModule } from "@/server/auth";
import { prisma } from "@/lib/prisma";
import { createNurseTaskForDoctor } from "@/server/nurse";
import {
  addIpdCartItem,
  updateIpdCartItem,
  admitPatient,
  createIpdBed,
  createIpdWard,
  deleteIpdBed,
  deleteIpdWard,
  generateDischargeSummary,
  generateDeathSummary,
  generateIpdFinalBill,
  getIpdAdmission,
  getIpdAdmissionsByPatient,
  getIpdCart,
  getIpdRoundConfigs,
  getIpdSnapshot,
  getIpdWards,
  markIpdReadyForDischarge,
  removeIpdCartItem,
  saveIpdTask,
  updateIpdTaskStatus,
  saveDischargeSummary,
  saveDeathSummary,
  saveIpdRoundConfig,
  transferIpdAdmission,
  updateIpdAdmission,
  updateIpdBed,
  updateIpdWard,
  deleteIpdRoundConfig,
  type DischargeSummaryPayload,
  type DeathSummaryPayload,
  type IpdSnapshot,
} from "@/server/ipd";

export async function getIpdWardsAction() {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "frontdesk", "doctor");
    return getIpdWards(ctx);
  });
}

export async function getIpdSnapshotAction(): Promise<ActionResult<IpdSnapshot>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "frontdesk");
    return getIpdSnapshot(ctx);
  });
}

export async function getIpdAdmissionAction(id: string) {
  return runAction(async () => {
    const ctx = await requireAnyModule("doctor", "frontdesk", "nurse", "admin");
    return getIpdAdmission(ctx, id);
  });
}

export async function getIpdAdmissionsByPatientAction(patientId: string) {
  return runAction(async () => {
    const ctx = await requireAnyModule("doctor", "frontdesk", "admin", "nurse");
    return getIpdAdmissionsByPatient(ctx, patientId);
  });
}

export async function admitPatientAction(input: IpdAdmissionInput): Promise<ActionResult<{ id: string; visitId: string; patientId: string }>> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return admitPatient(ctx, input);
  });
}

export async function updateIpdAdmissionAction(
  id: string,
  patch: {
    status?: IpdAdmissionStatus;
    expectedDischarge?: string;
    diagnosis?: string;
    lastRoundNote?: string;
  },
) {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return updateIpdAdmission(ctx, id, patch);
  });
}

export async function transferIpdAdmissionAction(id: string, target: { wardId: string; bedId: string }) {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return transferIpdAdmission(ctx, id, target);
  });
}

export async function createIpdWardAction(input: { label: string; category: string }) {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "frontdesk");
    return createIpdWard(ctx, input);
  });
}

export async function updateIpdWardAction(id: string, input: { label?: string; category?: string; active?: boolean }) {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "frontdesk");
    return updateIpdWard(ctx, id, input);
  });
}

export async function deleteIpdWardAction(id: string) {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "frontdesk");
    return deleteIpdWard(ctx, id);
  });
}

export async function createIpdBedAction(wardId: string, input: { label: string }) {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "frontdesk");
    return createIpdBed(ctx, wardId, input);
  });
}

export async function updateIpdBedAction(id: string, input: { label?: string; active?: boolean }) {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "frontdesk");
    return updateIpdBed(ctx, id, input);
  });
}

export async function deleteIpdBedAction(id: string) {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "frontdesk");
    return deleteIpdBed(ctx, id);
  });
}

export async function generateDischargeSummaryAction(id: string): Promise<ActionResult<DischargeSummaryPayload>> {
  return runAction(async () => {
    const ctx = await requireModule("doctor");
    return generateDischargeSummary(ctx, id);
  });
}

export async function getNurseOptionsAction(): Promise<ActionResult<Array<{ id: string; name: string }>>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("doctor", "nurse", "admin");
    const staff = await prisma.adminStaff.findMany({
      where: { branchId: ctx.branchId, role: "nurse" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return staff.map((s) => ({ id: s.id, name: s.name }));
  });
}

export async function saveIpdTaskAction(
  ipdId: string,
  input: { text: string; assignee?: string; visitId?: string; assignedToNurseId?: string; assignedToNurseName?: string },
): Promise<ActionResult<{ id: string; nurseTaskId?: string }>> {
  return runAction(async () => {
    const ctx = await requireModule("doctor");
    const ipdTask = await saveIpdTask(ctx, ipdId, { text: input.text, assignee: input.assignee });
    let nurseTaskId: string | undefined;
    if (input.visitId) {
      const nurseTask = await createNurseTaskForDoctor(ctx, input.visitId, {
        title: input.text,
        assignedBy: input.assignee,
        assignedToNurseId: input.assignedToNurseId,
        assignedToNurseName: input.assignedToNurseName,
      });
      if (nurseTask) nurseTaskId = nurseTask.id;
    }
    return { id: ipdTask.id, nurseTaskId };
  });
}

export async function updateIpdTaskStatusAction(taskId: string, status: "pending" | "completed"): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("doctor", "nurse", "admin");
    return updateIpdTaskStatus(ctx, taskId, status);
  });
}

export async function saveDischargeSummaryAction(id: string, summary: DischargeSummaryPayload): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireModule("doctor");
    return saveDischargeSummary(ctx, id, summary);
  });
}

export async function markIpdReadyForDischargeAction(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireModule("doctor");
    return markIpdReadyForDischarge(ctx, id);
  });
}

export async function generateDeathSummaryAction(id: string): Promise<ActionResult<DeathSummaryPayload>> {
  return runAction(async () => {
    const ctx = await requireModule("doctor");
    return generateDeathSummary(ctx, id);
  });
}

export async function saveDeathSummaryAction(id: string, summary: DeathSummaryPayload): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireModule("doctor");
    return saveDeathSummary(ctx, id, summary);
  });
}

export async function getIpdCartAction(admissionId: string): Promise<ActionResult<IpdCartItem[]>> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return getIpdCart(ctx, admissionId);
  });
}

export async function addIpdCartItemAction(
  admissionId: string,
  item: Omit<IpdCartItem, "id" | "addedAt">,
): Promise<ActionResult<IpdCartItem[]>> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return addIpdCartItem(ctx, admissionId, item);
  });
}

export async function updateIpdCartItemAction(
  admissionId: string,
  itemId: string,
  quantity: number,
): Promise<ActionResult<IpdCartItem[]>> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return updateIpdCartItem(ctx, admissionId, itemId, quantity);
  });
}

export async function removeIpdCartItemAction(admissionId: string, itemId: string): Promise<ActionResult<IpdCartItem[]>> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return removeIpdCartItem(ctx, admissionId, itemId);
  });
}

export async function generateIpdFinalBillAction(
  admissionId: string,
  input: {
    mode?: string;
    paymentSplits?: { mode: string; amount: number }[];
    discount?: number;
  },
): Promise<ActionResult<{ visitId: string; invoiceNumber: string; total: number; amountPaid: number; balanceDue: number }>> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return generateIpdFinalBill(ctx, admissionId, input);
  });
}

export async function getIpdRoundConfigsAction() {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "nurse");
    return getIpdRoundConfigs(ctx);
  });
}

export async function saveIpdRoundConfigAction(
  input: Parameters<typeof saveIpdRoundConfig>[1],
) {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "nurse");
    return saveIpdRoundConfig(ctx, input);
  });
}

export async function deleteIpdRoundConfigAction(id: string) {
  return runAction(async () => {
    const ctx = await requireAnyModule("admin", "nurse");
    return deleteIpdRoundConfig(ctx, id);
  });
}
