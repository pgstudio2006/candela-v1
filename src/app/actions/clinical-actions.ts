"use server";

import type { ConsultationRecord, PrescriptionLine } from "@/design-system/doctor-data";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";
import type { BillingResult, CounselBillingInput } from "@/server/clinical";
import { getVisitReceipt } from "@/server/invoicing";
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
  getVisitForBilling,
  listFrontdeskAuditLogs,
  processBilling,
  processCounselBilling,
  registerPatient,
  rescheduleAppointment,
  saveSubmission,
  searchPatientsPaginated,
  updatePatient,
  updatePatientDemographics,
} from "@/server/clinical";
import { getPatientInvoices, getVisitInvoiceForBilling } from "@/server/invoicing";
import { requireAuth, requireAnyModule, requireModule } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/action-result";
import type { ClinicalSnapshot } from "@/server/clinical";
import { SCHEMA_DEPARTMENT } from "@/lib/schema-registry";
import type { CandelaRole } from "@/design-system/modules";
import { prisma } from "@/lib/prisma";
import { branchScope } from "@/server/tenancy";

function jsonRecord(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, string | number | boolean>;
}

export async function getClinicalSnapshotAction(): Promise<ActionResult<ClinicalSnapshot>> {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    return getClinicalSnapshot(ctx);
  });
}

export async function getPatientConsultationsAction(patientId: string): Promise<ActionResult<ConsultationRecord[]>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("frontdesk", "doctor", "admin");
    const visits = await prisma.opdVisit.findMany({
      where: { patientId, ...branchScope(ctx) },
      select: { id: true },
    });
    const visitIds = visits.map((visit) => visit.id);
    if (visitIds.length === 0) return [];
    const rows = await prisma.consultation.findMany({
      where: { visitId: { in: visitIds }, status: "completed" },
      orderBy: { completedAt: "desc" },
    });
    return rows.map((row) => ({
      visitId: row.visitId,
      patientId: row.patientId,
      doctorId: row.doctorId,
      startedAt: row.startedAt,
      completedAt: row.completedAt ?? undefined,
      status: row.status as ConsultationRecord["status"],
      treatmentMode: row.treatmentMode as ConsultationRecord["treatmentMode"],
      recommendCounsellor: row.recommendCounsellor,
      skipCounsellor: row.skipCounsellor,
      packageId: row.packageId ?? undefined,
      counsellorNotes: row.counsellorNotes ?? undefined,
      doctorAdvice: row.doctorAdvice ?? undefined,
      whatsappRxSent: row.whatsappRxSent,
      examination: jsonRecord(row.examination),
      diagnosis: jsonRecord(row.diagnosis),
      treatment: jsonRecord(row.treatment),
      prescription: (Array.isArray(row.prescription) ? row.prescription : []) as PrescriptionLine[],
      notes: row.notes,
      scribeTranscript: row.scribeTranscript ?? undefined,
      scribeLanguage: row.scribeLanguage ?? undefined,
      scribeAppliedAt: row.scribeAppliedAt ?? undefined,
      templateId: row.templateId ?? undefined,
      handoff: row.handoff && typeof row.handoff === "object" && !Array.isArray(row.handoff)
        ? (row.handoff as Record<string, string | number | boolean>)
        : undefined,
    }));
  });
}

export async function getActiveReferralDoctorsAction() {
  return runAction(async () => {
    const ctx = await requireAnyModule("frontdesk", "admin");
    return getActiveReferralDoctors(ctx);
  });
}

export async function getReferralDoctorWithPatientsAction(referralDoctorId: string) {
  return runAction(async () => {
    const ctx = await requireAnyModule("frontdesk", "admin");
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

export async function getVisitForBillingAction(visitId: string) {
  const ctx = await requireModule("frontdesk");
  return getVisitForBilling(ctx, visitId);
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

/** Age/DOB-only fix — usable by doctor & frontdesk so prescriptions print a real age. */
export async function updatePatientDemographicsAction(
  patientId: string,
  input: { dob?: string; age?: number },
): Promise<ActionResult<{ patientId: string; age: number; dateOfBirth: string | null }>> {
  return runAction(async () => {
    const ctx = await requireAnyModule("frontdesk", "doctor", "admin");
    return updatePatientDemographics(ctx, patientId, input);
  });
}

export async function saveSubmissionAction(
  formId: string,
  data: Record<string, string | number | boolean>,
  link?: { patientId?: string; visitId?: string },
  append?: boolean,
) {
  const module = (SCHEMA_DEPARTMENT[formId] ?? "frontdesk") as CandelaRole;
  const ctx = await requireModule(module);
  return saveSubmission(ctx, formId, data, link, append);
}

export async function getNurseScoresAction(visitId: string): Promise<
  ActionResult<{ id: string; submittedAt: string; data: Record<string, string | number | boolean> }[]>
> {
  return runAction(async () => {
    const ctx = await requireAnyModule("doctor", "nurse");
    const rows = await prisma.formSubmission.findMany({
      where: { formId: "nurse-scores", visitId, ...branchScope(ctx) },
      orderBy: { submittedAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      submittedAt: String(row.submittedAt),
      data:
        row.data && typeof row.data === "object" && !Array.isArray(row.data)
          ? (row.data as Record<string, string | number | boolean>)
          : {},
    }));
  });
}

export async function getVisitReceiptAction(visitId: string, invoiceId?: string) {
  const ctx = await requireAuth();
  try {
    const receipt = await fetchVisitReceipt(ctx, visitId, invoiceId);
    return { receipt };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load receipt.";
    console.error("[getVisitReceiptAction] failed for visit", visitId, "branch", ctx.branchId, err);
    return { error: message || "Could not load receipt." };
  }
}

export async function getPatientInvoicesAction(patientId: string) {
  return runAction(async () => {
    const ctx = await requireModule("frontdesk");
    const invoices = await getPatientInvoices(ctx, patientId);
    return { invoices };
  });
}

export async function getPatientInvoiceReceiptsAction(patientId: string): Promise<ActionResult<OpdReceiptPayload[]>> {
  return runAction(async () => {
    const ctx = await requireAuth();
    const invoices = (await getPatientInvoices(ctx, patientId)).filter((inv) => inv.visitId);
    const receipts = await Promise.all(
      invoices.map((inv) => getVisitReceipt(ctx, inv.visitId!, inv.id).catch(() => null)),
    );
    return receipts.filter((r): r is OpdReceiptPayload => Boolean(r));
  });
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
