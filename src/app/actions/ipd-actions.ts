"use server";

import type { IpdAdmissionInput, IpdAdmissionStatus } from "@/design-system/ipd-data";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireModule } from "@/server/auth";
import {
  admitPatient,
  createIpdBed,
  createIpdWard,
  deleteIpdBed,
  deleteIpdWard,
  getIpdAdmission,
  getIpdSnapshot,
  getIpdWards,
  transferIpdAdmission,
  updateIpdAdmission,
  updateIpdBed,
  updateIpdWard,
  type IpdSnapshot,
} from "@/server/ipd";

export async function getIpdWardsAction() {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return getIpdWards(ctx);
  });
}

export async function getIpdSnapshotAction(): Promise<ActionResult<IpdSnapshot>> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return getIpdSnapshot(ctx);
  });
}

export async function getIpdAdmissionAction(id: string) {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return getIpdAdmission(ctx, id);
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
    const ctx = await requireModule("frontdesk");
    return createIpdWard(ctx, input);
  });
}

export async function updateIpdWardAction(id: string, input: { label?: string; category?: string; active?: boolean }) {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return updateIpdWard(ctx, id, input);
  });
}

export async function deleteIpdWardAction(id: string) {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return deleteIpdWard(ctx, id);
  });
}

export async function createIpdBedAction(wardId: string, input: { label: string }) {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return createIpdBed(ctx, wardId, input);
  });
}

export async function updateIpdBedAction(id: string, input: { label?: string; active?: boolean }) {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return updateIpdBed(ctx, id, input);
  });
}

export async function deleteIpdBedAction(id: string) {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return deleteIpdBed(ctx, id);
  });
}
