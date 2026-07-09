"use server";

import type { BillingResult, CounselBillingInput } from "@/server/clinical";
import {
  bookAppointment,
  cancelAppointment,
  canOverrideDuplicate,
  checkDuplicatePatient,
  checkInVisit,
  completeJuniorExam,
  fetchVisitReceipt,
  getActiveReferralDoctors,
  getClinicalSnapshot,
  getReferralDoctorWithPatients,
  listFrontdeskAuditLogs,
  processBilling,
  processCounselBilling,
  registerPatient,
  rescheduleAppointment,
  saveSubmission,
  searchPatientsPaginated,
  updatePatient,
} from "@/server/clinical";
import { getVisitInvoiceForBilling } from "@/server/invoicing";
import { requireAuth, requireModule } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/action-result";
import type { ClinicalSnapshot } from "@/server/clinical";
import { SCHEMA_DEPARTMENT } from "@/lib/schema-registry";
import type { CandelaRole } from "@/design-system/modules";

export async function getClinicalSnapshotAction(): Promise<ActionResult<ClinicalSnapshot>> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return getClinicalSnapshot(ctx);
  });
}

export async function getActiveReferralDoctorsAction() {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return getActiveReferralDoctors(ctx);
  });
}

export async function getReferralDoctorWithPatientsAction(referralDoctorId: string) {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return getReferralDoctorWithPatients(ctx, referralDoctorId);
  });
}

export async function registerPatientAction(input: {
  data: Record<string, string | number | boolean>;
  patientId: string;
  visitId?: string;
  startVisit?: boolean;
  forceDuplicate?: boolean;
}): Promise<
  ActionResult<{ patientId: string; visitId: string; uhid: string }>
> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return registerPatient(ctx, input);
  });
}

export async function checkDuplicatePatientAction(phone: string, uhid?: string) {
  const ctx = await requireModule("frontdesk");
  return checkDuplicatePatient(ctx, phone, uhid);
}

export async function canOverrideDuplicateAction() {
  const ctx = await requireModule("frontdesk");
  return canOverrideDuplicate(ctx.role);
}

export async function checkInVisitAction(input: {
  data: Record<string, string | number | boolean>;
  existingVisitId?: string;
  newVisitId?: string;
}) {
  const ctx = await requireModule("frontdesk");
  return checkInVisit(ctx, input);
}

export async function processBillingAction(
  visitId: string,
  data: Record<string, string | number | boolean>,
): Promise<BillingResult> {
  const ctx = await requireModule("frontdesk");
  return processBilling(ctx, visitId, data);
}

export async function getVisitBillingAction(visitId: string) {
  const ctx = await requireModule("frontdesk");
  return getVisitInvoiceForBilling(ctx, visitId);
}

export async function processCounselBillingAction(
  visitId: string,
  input: CounselBillingInput,
): Promise<BillingResult> {
  const ctx = await requireModule("frontdesk");
  return processCounselBilling(ctx, visitId, input);
}

export async function completeJuniorExamAction(
  visitId: string,
  data?: Record<string, string | number | boolean>,
) {
  const ctx = await requireModule("frontdesk");
  return completeJuniorExam(ctx, visitId, data);
}

export async function bookAppointmentAction(input: {
  data: Record<string, string | number | boolean>;
  appointmentId: string;
  visitId: string;
}) {
  const ctx = await requireModule("frontdesk");
  return bookAppointment(ctx, input);
}

export async function cancelAppointmentAction(appointmentId: string) {
  const ctx = await requireModule("frontdesk");
  return cancelAppointment(ctx, appointmentId);
}

export async function rescheduleAppointmentAction(
  appointmentId: string,
  input: { date: string; time: string; doctorId?: string; departmentId?: string },
) {
  const ctx = await requireModule("frontdesk");
  return rescheduleAppointment(ctx, appointmentId, input);
}

export async function updatePatientAction(
  patientId: string,
  data: Record<string, string | number | boolean>,
) {
  const ctx = await requireModule("frontdesk");
  return updatePatient(ctx, patientId, data);
}

export async function saveSubmissionAction(
  formId: string,
  data: Record<string, string | number | boolean>,
  link?: { patientId?: string; visitId?: string },
) {
  const module = (SCHEMA_DEPARTMENT[formId] ?? "frontdesk") as CandelaRole;
  const ctx = await requireModule(module);
  return saveSubmission(ctx, formId, data, link);
}

export async function getVisitReceiptAction(visitId: string) {
  const ctx = await requireAuth();
  try {
    const receipt = await fetchVisitReceipt(ctx, visitId);
    return { receipt };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load receipt.";
    console.error("[getVisitReceiptAction] failed for visit", visitId, "branch", ctx.branchId, err);
    return { error: message || "Could not load receipt." };
  }
}

export async function searchPatientsPaginatedAction(input: {
  q?: string;
  page?: number;
  pageSize?: number;
  view?: "all" | "balance" | "today";
}) {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return searchPatientsPaginated(ctx, input);
  });
}

export async function listFrontdeskAuditLogsAction(input?: { limit?: number; cursor?: string }) {
  const ctx = await requireModule("frontdesk");
  return listFrontdeskAuditLogs(ctx, input ?? {});
}
