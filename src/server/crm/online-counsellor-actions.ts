"use server";

import type { CrmCallOutcome, CrmLeadStatus } from "@/design-system/crm-data";
import { requireModule, requireAnyModule } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/action-result";
import { getServerContext } from "@/server/context";
import {
  assignCounsellorToPatient,
  convertLeadToPatient,
  createCommission,
  detectLeadByMobile,
  getAllCommissions,
  getCounsellorCommissions,
  getOnlineCounsellorLeads,
  resolveWalkInCounsellor,
  updateCommissionStatus,
  updateLeadCallOutcome,
  updateLeadStatus,
  type LeadToPatientResult,
  type MobileDetectionResult,
} from "@/server/crm/online-counsellor";
import type { CrmCommission, CrmLead } from "@/design-system/crm-data";

export async function updateLeadCallOutcomeAction(
  leadId: string,
  callOutcome: CrmCallOutcome,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requireModule("crm");
    return updateLeadCallOutcome(ctx, leadId, callOutcome);
  });
}

export async function updateLeadStatusAction(
  leadId: string,
  status: CrmLeadStatus,
  formData?: Record<string, string | number | boolean>,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requireModule("crm");
    return updateLeadStatus(ctx, leadId, status, formData);
  });
}

export async function convertLeadToPatientAction(
  leadId: string,
  options: {
    bookAppointment?: boolean;
    doctorId?: string;
    doctorName?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    source?: string;
  },
): Promise<ActionResult<LeadToPatientResult>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("crm", "frontdesk");
    return convertLeadToPatient(ctx, leadId, options);
  });
}

export async function detectLeadByMobileAction(
  phone: string,
): Promise<ActionResult<MobileDetectionResult>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("crm", "frontdesk");
    return detectLeadByMobile(ctx, phone);
  });
}

export async function assignCounsellorToPatientAction(
  patientId: string,
  counsellorId: string,
  counsellorName: string,
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return assignCounsellorToPatient(ctx, patientId, counsellorId, counsellorName);
  });
}

export async function getOnlineCounsellorLeadsAction(
  counsellorId: string,
): Promise<ActionResult<CrmLead[]>> {
  return runAction(async () => {
    const ctx = await requireModule("crm");
    return getOnlineCounsellorLeads(ctx, counsellorId);
  });
}

export async function getCounsellorCommissionsAction(
  counsellorId: string,
): Promise<ActionResult<CrmCommission[]>> {
  return runAction(async () => {
    const ctx = await requireModule("crm");
    return getCounsellorCommissions(ctx, counsellorId);
  });
}

export async function getAllCommissionsAction(): Promise<ActionResult<CrmCommission[]>> {
  return runAction(async () => {
    const ctx = await requireModule("crm");
    return getAllCommissions(ctx);
  });
}

export async function createCommissionAction(input: {
  leadId?: string;
  counsellorId: string;
  counsellorName: string;
  patientId?: string;
  patientName?: string;
  visitId?: string;
  billAmount: number;
  commissionPercent: number;
}): Promise<ActionResult<CrmCommission>> {
  return runAction(async () => {
    const ctx = await requireModule("crm");
    return createCommission(ctx, input);
  });
}

export async function updateCommissionStatusAction(
  commissionId: string,
  status: "pending" | "approved" | "paid",
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await requireModule("crm");
    return updateCommissionStatus(ctx, commissionId, status);
  });
}

export async function getWalkInCounsellorAction(): Promise<ActionResult<{ id: string; name: string } | null>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("crm", "frontdesk");
    return resolveWalkInCounsellor(ctx);
  });
}

