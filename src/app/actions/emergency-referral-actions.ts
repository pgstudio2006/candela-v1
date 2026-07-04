"use server";

import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { runAction, type ActionResult } from "@/server/action-result";
import { requireModule } from "@/server/auth";
import { branchScope } from "@/server/tenancy";
import { writePlatformAudit } from "@/server/platform-audit";

export type EmergencyReferralInput = {
  patientId: string;
  visitId?: string;
  referredToType: string;
  referredToId?: string;
  referredToName: string;
  referralReason: string;
  referralNotes?: string;
};

export type EmergencyReferralItem = {
  id: string;
  patientId: string;
  visitId: string | null;
  fromDoctorName: string | null;
  referredToType: string;
  referredToName: string;
  referralReason: string;
  status: string;
  createdAt: string;
};

export async function createEmergencyReferralAction(input: EmergencyReferralInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    const scope = branchScope(ctx);
    const id = createId("eref");
    await prisma.emergencyReferral.create({
      data: {
        id,
        ...scope,
        patientId: input.patientId,
        visitId: input.visitId ?? null,
        fromDoctorId: ctx.userId ?? null,
        fromDoctorName: ctx.userId ?? null,
        referredToType: input.referredToType,
        referredToId: input.referredToId ?? null,
        referredToName: input.referredToName,
        referralReason: input.referralReason,
        referralNotes: input.referralNotes ?? null,
      },
    });
    await writePlatformAudit({
      ctx,
      actor: ctx.userId ?? "system",
      actorRole: ctx.role ?? "emergency",
      module: "emergency",
      action: "referral_created",
      entityType: "emergency_referral",
      entityId: id,
      summary: `Emergency referral to ${input.referredToName} for patient ${input.patientId}`,
    }).catch(() => {});
    return { id };
  });
}

export async function listEmergencyReferralsAction(patientId?: string): Promise<ActionResult<EmergencyReferralItem[]>> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    const rows = await prisma.emergencyReferral.findMany({
      where: { ...branchScope(ctx), ...(patientId ? { patientId } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      patientId: r.patientId,
      visitId: r.visitId,
      fromDoctorName: r.fromDoctorName,
      referredToType: r.referredToType,
      referredToName: r.referredToName,
      referralReason: r.referralReason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

export async function updateEmergencyReferralStatusAction(id: string, status: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    await requireModule("frontdesk");
    await prisma.emergencyReferral.update({ where: { id }, data: { status } });
  });
}

export async function deleteEmergencyReferralAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    await requireModule("frontdesk");
    await prisma.emergencyReferral.delete({ where: { id } });
  });
}
