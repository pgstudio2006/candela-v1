import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  IpdAdmissionDetail,
  IpdAdmissionInput,
  IpdAdmissionStatus,
  IpdAdvancePayment,
  IpdRefundVoucher,
  IpdBedRow,
  IpdBedSummary,
  IpdBillingMode,
  IpdCartItem,
  IpdPatientType,
  IpdSnapshot,
  IpdWard,
} from "@/design-system/ipd-data";
import type { ServerContext } from "@/server/context";
import { ServerActionError } from "@/server/errors";
import { branchScope } from "@/server/tenancy";
import { writePlatformAudit } from "@/server/platform-audit";
import { ensureHospitalBootstrap } from "@/server/hospital-bootstrap";
import { syncVisitFromOpdVisit } from "@/server/visit-sync";
import { createId } from "@/lib/id";
import { isPataudiBranch } from "@/lib/auth-types";
import { patientDisplayName, resolvePatientAge } from "@/lib/frontdesk-workflow";
import { resolveDoctorName } from "@/lib/clinical-roster";
import { backfillBranchScope } from "@/server/branch-scope";
import { loadClinicalRoster, resolveDoctorProfile } from "@/server/clinical/roster";
import { hasPermission } from "@/server/permissions";
import { createVisitInvoice, getVisitReceipt } from "@/server/invoicing";
import { generateInvoicePdf } from "@/lib/invoice-pdf";
import { deliverWhatsAppDocument } from "@/server/notification-delivery";
import { getActiveConnection, decryptWhatsAppToken } from "@/server/whatsapp/connection";
import { computeGstInvoice, parseBranchGstSettings } from "@/lib/gst-invoicing";
import { readPharmacyWorkspace } from "@/server/workspace-state";
import { defaultPharmacyState } from "@/server/revenue/state-seeds";
import {
  generateDischargeSummaryFromRounds,
  generateDeathSummaryFromRounds,
} from "@/lib/ai/ipd-summary-generator";

export type { IpdSnapshot } from "@/design-system/ipd-data";

export async function ensureIpdWardBed(
  tx: any,
  ctx: Pick<ServerContext, "tenantId" | "branchId">,
  wardLabel: string,
  bedLabel: string,
  category: string,
): Promise<{ wardId: string; bedId: string }> {
  let ward = await tx.ipdWard.findFirst({
    where: { tenantId: ctx.tenantId, branchId: ctx.branchId, label: wardLabel },
  });
  if (!ward) {
    ward = await tx.ipdWard.create({
      data: {
        id: createId("ipdward"),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        label: wardLabel,
        category,
      },
    });
  }
  let bed = await tx.ipdBed.findFirst({
    where: { wardId: ward.id, label: bedLabel },
  });
  if (!bed) {
    bed = await tx.ipdBed.create({
      data: {
        id: createId("ipdbed"),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        wardId: ward.id,
        label: bedLabel,
      },
    });
  }
  return { wardId: ward.id, bedId: bed.id };
}

type WardWithBeds = {
  id: string;
  label: string;
  category: string;
  active: boolean;
  beds: IpdBedRow[];
};

export async function findOnDutyNurseForWard(
  tx: any,
  ctx: Pick<ServerContext, "branchId">,
  wardLabel?: string | null,
) {
  const baseWhere = {
    branchId: ctx.branchId,
    role: "nurse",
    onDuty: true,
  };
  if (wardLabel) {
    const wardMatch = await tx.adminStaff.findFirst({
      where: { ...baseWhere, ward: wardLabel },
    });
    if (wardMatch) return wardMatch;
  }
  return tx.adminStaff.findFirst({ where: baseWhere });
}

function toWardDto(row: {
  id: string;
  label: string;
  category: string;
  active: boolean;
  beds: { id: string; label: string; active: boolean }[];
}): IpdWard {
  return {
    id: row.id,
    label: row.label,
    category: row.category as IpdWard["category"],
    beds: row.beds.filter((b) => b.active).map((b) => b.label),
  };
}

export async function getIpdWards(ctx: ServerContext): Promise<WardWithBeds[]> {
  await backfillBranchScope(ctx);
  const scope = branchScope(ctx);
  const rows = await prisma.ipdWard.findMany({
    where: { tenantId: scope.tenantId, branchId: scope.branchId },
    orderBy: { createdAt: "asc" },
    include: {
      beds: { orderBy: { createdAt: "asc" } },
    },
  });

  const wardIds = rows.map((w) => w.id);
  const activeAdmissions = await prisma.ipdAdmission.findMany({
    where: {
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      wardId: { in: wardIds },
      status: { in: ["admitted", "discharge_planned"] },
    },
    include: { patient: { select: { id: true, name: true, fullName: true, uhid: true } } },
  });

  const admissionByBedId = new Map(
    activeAdmissions.map((a) => [
      a.bedId,
      {
        id: a.id,
        patientId: a.patientId,
        patientName: patientDisplayName(a.patient) ?? a.patientId,
        doctorName: a.doctorName,
        diagnosis: a.diagnosis,
        status: a.status as IpdAdmissionStatus,
        admittedAt: a.admittedAt.toISOString(),
        expectedDischarge: a.expectedDischarge?.toISOString() ?? undefined,
      },
    ]),
  );

  return rows.map((w) => ({
    id: w.id,
    label: w.label,
    category: w.category,
    active: w.active,
    beds: w.beds.map((b) => {
      const admission = admissionByBedId.get(b.id);
      return {
        id: b.id,
        wardId: w.id,
        label: b.label,
        active: b.active,
        occupied: Boolean(admission),
        admission,
      };
    }),
  }));
}

export async function getIpdSnapshot(ctx: ServerContext): Promise<IpdSnapshot> {
  await ensureHospitalBootstrap();
  await backfillBranchScope(ctx);
  const scope = branchScope(ctx);

  const wardRows = await getIpdWards(ctx);

  const wards: IpdBedSummary[] = wardRows.map((ward) => ({
    wardId: ward.id,
    ward: ward.label,
    category: ward.category as IpdWard["category"],
    active: ward.active,
    beds: ward.beds.map((bed) => ({
      id: bed.id,
      label: bed.label,
      active: bed.active,
      occupied: bed.occupied,
      admission: bed.admission,
    })),
  }));

  const totalBeds = wards.reduce((sum, w) => sum + w.beds.filter((b) => b.active).length, 0);
  const occupiedBeds = wards.reduce((sum, w) => sum + w.beds.filter((b) => b.active && b.occupied).length, 0);

  const [registeredPatients, roster] = await Promise.all([
    prisma.patient.findMany({
      where: {
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        status: { in: ["active", "emergency"] },
      },
      select: { id: true, name: true, fullName: true, uhid: true, phone: true },
      orderBy: { createdAt: "desc" },
    }),
    loadClinicalRoster(ctx),
  ]);

  const patientOptions = registeredPatients.map((p) => ({
    id: p.id,
    name: patientDisplayName(p),
    uhid: p.uhid,
    phone: p.phone ?? "",
  }));

  const doctorOptions = roster.allDoctors.map((d) => ({ id: d.id, name: d.name }));

  const departmentOptions = roster.departments.map((d) => ({
    id: d.id,
    label: d.label,
  }));

  return {
    wards,
    totalBeds,
    occupiedBeds,
    freeBeds: totalBeds - occupiedBeds,
    patients: patientOptions,
    doctors: doctorOptions,
    departments: departmentOptions,
  };
}

export async function getIpdAdmission(ctx: ServerContext, id: string) {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
    include: {
      patient: {
        select: {
          id: true,
          name: true,
          fullName: true,
          uhid: true,
          phone: true,
          age: true,
          dateOfBirth: true,
          gender: true,
        },
      },
      ward: true,
      bed: true,
      advances: { orderBy: { receivedAt: "desc" } },
      refundVouchers: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  const visit = admission.visitId
    ? await prisma.opdVisit.findUnique({ where: { id: admission.visitId }, select: { balanceDue: true, amountPaid: true, billAmount: true } })
    : null;

  const [finalInvoice] = admission.visitId
    ? await prisma.invoice.findMany({
        where: { visitId: admission.visitId, ...scope },
        orderBy: { createdAt: "desc" },
        take: 1,
      })
    : [null];

  const advancePayments: IpdAdmissionDetail["advancePayments"] = admission.advances.map((a) => ({
    id: a.id,
    admissionId: a.admissionId,
    patientId: a.patientId,
    amount: Number(a.amount),
    receivedAmount: Number(a.receivedAmount),
    pendingAmount: Number(a.pendingAmount),
    mode: a.mode,
    splits: (a.splits as { mode: string; amount: number }[] | null) ?? null,
    status: a.status as IpdAdvancePayment["status"],
    referenceNo: a.referenceNo,
    notes: a.notes,
    receivedAt: a.receivedAt.toISOString(),
    receivedBy: a.receivedBy,
  }));

  const refundVouchers: IpdAdmissionDetail["refundVouchers"] = admission.refundVouchers.map((v) => ({
    id: v.id,
    admissionId: v.admissionId,
    patientId: v.patientId,
    invoiceId: v.invoiceId,
    amount: Number(v.amount),
    mode: v.mode,
    status: v.status as IpdRefundVoucher["status"],
    approvedBy: v.approvedBy,
    requestedBy: v.requestedBy,
    referenceNo: v.referenceNo,
    notes: v.notes,
    createdAt: v.createdAt.toISOString(),
  }));

  const walletBalance = (await getIpdWalletBalance(ctx, id)).balance;

  const detail: IpdAdmissionDetail = {
    id: admission.id,
    visitId: admission.visitId ?? "",
    patientId: admission.patientId,
    patientName: patientDisplayName(admission.patient) ?? admission.patientId,
    uhid: admission.patient.uhid,
    phone: admission.patient.phone,
    age: resolvePatientAge(admission.patient.age, admission.patient.dateOfBirth),
    gender: admission.patient.gender,
    ward: admission.ward.label,
    bed: admission.bed.label,
    category: admission.ward.category,
    patientType: (admission.patientType ?? "general") as IpdPatientType,
    billingMode: (admission.billingMode ?? "postpaid") as IpdBillingMode,
    expectedDischarge: admission.expectedDischarge?.toISOString() ?? null,
    admittedAt: admission.admittedAt.toISOString(),
    diagnosis: admission.diagnosis,
    attendingDoctorId: admission.attendingDoctorId,
    doctorName: admission.doctorName,
    lastRoundAt: admission.lastRoundAt?.toISOString() ?? null,
    lastRoundNote: admission.lastRoundNote ?? null,
    status: admission.status as IpdAdmissionStatus,
    cart: (admission.cart as unknown as IpdCartItem[] | null) ?? [],
    balanceDue: visit?.balanceDue ?? null,
    amountPaid: visit?.amountPaid ?? null,
    billAmount: visit?.billAmount ?? null,
    walletBalance,
    advancePayments,
    refundVouchers,
    refundAmount: finalInvoice ? Number(finalInvoice.refundAmount) : null,
    finalInvoiceId: finalInvoice?.id ?? null,
    dischargeSummary: admission.dischargeSummary,
    deathSummary: admission.deathSummary,
  };
  return detail;
}

export async function getIpdAdmissionsByPatient(
  ctx: ServerContext,
  patientId: string,
): Promise<
  Array<{
    id: string;
    visitId: string | null;
    ward: string;
    bed: string;
    category: string;
    admittedAt: string;
    dischargedAt: string | null;
    deathDeclaredAt: string | null;
    status: string;
    diagnosis: string;
    doctorName: string;
    rounds: IpdRoundLogEntry[];
    dischargeSummary: unknown;
    deathSummary: unknown;
  }>
> {
  const scope = branchScope(ctx);
  const admissions = await prisma.ipdAdmission.findMany({
    where: { patientId, tenantId: scope.tenantId, branchId: scope.branchId },
    include: { ward: true, bed: true },
    orderBy: { admittedAt: "desc" },
  });

  const result: Awaited<ReturnType<typeof getIpdAdmissionsByPatient>> = [];
  for (const a of admissions) {
    const logs = await prisma.ipdRoundLog.findMany({
      where: {
        tenantId: scope.tenantId,
        branchId: scope.branchId,
        OR: [{ ipdAdmissionId: a.id }, { visitId: a.visitId ?? undefined }],
      },
      orderBy: { createdAt: "desc" },
    });
    result.push({
      id: a.id,
      visitId: a.visitId,
      ward: a.ward.label,
      bed: a.bed.label,
      category: a.ward.category,
      admittedAt: a.admittedAt.toISOString(),
      dischargedAt: a.dischargedAt?.toISOString() ?? null,
      deathDeclaredAt: a.deathDeclaredAt?.toISOString() ?? null,
      status: a.status,
      diagnosis: a.diagnosis,
      doctorName: a.doctorName,
      rounds: logs.map((row) => ({
        id: row.id,
        kind: row.kind,
        at: row.createdAt.toISOString(),
        actorName: row.actorName,
        actorRole: row.actorRole,
        content: row.content ?? "",
        data:
          row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
            ? (row.payload as Record<string, string | number | boolean>)
            : null,
      })),
      dischargeSummary: a.dischargeSummary,
      deathSummary: a.deathSummary,
    });
  }
  return result;
}

export async function getIpdWalletBalance(ctx: ServerContext, admissionId: string) {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, ...scope },
    select: { visitId: true },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  const [advances, vouchers, invoices] = await Promise.all([
    prisma.ipdAdvancePayment.findMany({
      where: { admissionId, tenantId: scope.tenantId, branchId: scope.branchId, status: "received" },
    }),
    prisma.ipdRefundVoucher.findMany({
      where: { admissionId, tenantId: scope.tenantId, branchId: scope.branchId, status: "issued" },
    }),
    admission.visitId
      ? prisma.invoice.findMany({
          where: { visitId: admission.visitId, ...scope },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);
  const received = advances.reduce((s, a) => s + Number(a.receivedAmount), 0);
  const issuedRefund = vouchers.reduce((s, v) => s + Number(v.amount), 0);
  const advanceUsed = invoices.reduce(
    (s, inv) => s + Number((inv.payload as Record<string, unknown> | null)?.advanceUsed ?? 0),
    0,
  );
  return { balance: Math.max(0, received - issuedRefund - advanceUsed), received, issuedRefund };
}

type AdvanceInput = {
  amount: number;
  mode: string;
  splits?: { mode: string; amount: number }[];
  referenceNo?: string;
  notes?: string;
};

function isPendingMode(mode?: string) {
  return mode === "due" || mode === "pending";
}

export async function recordIpdAdvancePayment(
  ctx: ServerContext,
  admissionId: string,
  input: AdvanceInput,
): Promise<IpdAdvancePayment> {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
    select: { patientId: true, visitId: true },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  if (input.amount <= 0) throw new ServerActionError("VALIDATION", "Amount must be greater than zero.");

  const splits = input.splits?.length
    ? input.splits
    : [{ mode: input.mode, amount: input.amount }];

  const total = splits.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  if (Math.abs(total - input.amount) > 0.01) {
    throw new ServerActionError("VALIDATION", "Split totals do not match the advance amount.");
  }

  const pendingAmount = splits
    .filter((p) => isPendingMode(p.mode))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const receivedAmount = total - pendingAmount;
  const status = pendingAmount > 0 && pendingAmount >= total ? "pending" : "received";
  const mode = splits.length === 1 ? splits[0].mode : "split";

  const created = await prisma.ipdAdvancePayment.create({
    data: {
      id: createId("ipdadv"),
      ...scope,
      admissionId,
      patientId: admission.patientId,
      visitId: admission.visitId,
      amount: total,
      receivedAmount,
      pendingAmount,
      mode,
      splits: splits as unknown as Prisma.InputJsonValue,
      status,
      referenceNo: input.referenceNo,
      notes: input.notes,
      receivedBy: ctx.userId,
    },
  });

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_advance_recorded",
    entityType: "ipd_admission",
    entityId: admissionId,
    summary: `Recorded ${input.mode} advance of ${total} for admission ${admissionId}`,
    payload: { amount: total, receivedAmount, pendingAmount, mode },
  });

  return {
    id: created.id,
    admissionId: created.admissionId,
    patientId: created.patientId,
    amount: Number(created.amount),
    receivedAmount: Number(created.receivedAmount),
    pendingAmount: Number(created.pendingAmount),
    mode: created.mode,
    splits: (created.splits as { mode: string; amount: number }[] | null) ?? null,
    status: created.status as IpdAdvancePayment["status"],
    referenceNo: created.referenceNo,
    notes: created.notes,
    receivedAt: created.receivedAt.toISOString(),
    receivedBy: created.receivedBy,
  };
}

export async function getIpdAdvancePayments(ctx: ServerContext, admissionId: string): Promise<IpdAdvancePayment[]> {
  const scope = branchScope(ctx);
  const rows = await prisma.ipdAdvancePayment.findMany({
    where: { admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
    orderBy: { receivedAt: "desc" },
  });
  return rows.map((a) => ({
    id: a.id,
    admissionId: a.admissionId,
    patientId: a.patientId,
    amount: Number(a.amount),
    receivedAmount: Number(a.receivedAmount),
    pendingAmount: Number(a.pendingAmount),
    mode: a.mode,
    splits: (a.splits as { mode: string; amount: number }[] | null) ?? null,
    status: a.status as IpdAdvancePayment["status"],
    referenceNo: a.referenceNo,
    notes: a.notes,
    receivedAt: a.receivedAt.toISOString(),
    receivedBy: a.receivedBy,
  }));
}

export async function createIpdRefundVoucher(
  ctx: ServerContext,
  admissionId: string,
  input: { amount: number; mode: string; notes?: string; invoiceId?: string },
): Promise<IpdRefundVoucher> {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
    select: { patientId: true },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  if (input.amount <= 0) throw new ServerActionError("VALIDATION", "Amount must be greater than zero.");

  const created = await prisma.ipdRefundVoucher.create({
    data: {
      id: createId("ipdref"),
      ...scope,
      admissionId,
      patientId: admission.patientId,
      invoiceId: input.invoiceId,
      amount: input.amount,
      mode: input.mode,
      status: "pending",
      requestedBy: ctx.userId,
      notes: input.notes,
    },
  });

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_refund_voucher_created",
    entityType: "ipd_admission",
    entityId: admissionId,
    summary: `Created refund voucher of ${input.amount} for admission ${admissionId}`,
    payload: { amount: input.amount, mode: input.mode, invoiceId: input.invoiceId },
  });

  return {
    id: created.id,
    admissionId: created.admissionId,
    patientId: created.patientId,
    invoiceId: created.invoiceId,
    amount: Number(created.amount),
    mode: created.mode,
    status: created.status as IpdRefundVoucher["status"],
    approvedBy: created.approvedBy,
    requestedBy: created.requestedBy,
    referenceNo: created.referenceNo,
    notes: created.notes,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function approveIpdRefundVoucher(ctx: ServerContext, voucherId: string): Promise<IpdRefundVoucher> {
  const allowed = ctx.role === "admin" || (await hasPermission(ctx, "ipd_refund_approve"));
  if (!allowed) throw new ServerActionError("FORBIDDEN", "You do not have permission to approve refunds.");

  const scope = branchScope(ctx);
  const voucher = await prisma.ipdRefundVoucher.findFirst({
    where: { id: voucherId, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!voucher) throw new ServerActionError("NOT_FOUND", "Refund voucher not found.");
  if (voucher.status !== "pending") throw new ServerActionError("VALIDATION", "Voucher is not in pending state.");

  const updated = await prisma.ipdRefundVoucher.update({
    where: { id: voucherId },
    data: { status: "approved", approvedBy: ctx.userId },
  });

  return {
    id: updated.id,
    admissionId: updated.admissionId,
    patientId: updated.patientId,
    invoiceId: updated.invoiceId,
    amount: Number(updated.amount),
    mode: updated.mode,
    status: updated.status as IpdRefundVoucher["status"],
    approvedBy: updated.approvedBy,
    requestedBy: updated.requestedBy,
    referenceNo: updated.referenceNo,
    notes: updated.notes,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function issueIpdRefundVoucher(
  ctx: ServerContext,
  voucherId: string,
  input?: { referenceNo?: string },
): Promise<IpdRefundVoucher> {
  const allowed = ctx.role === "admin" || (await hasPermission(ctx, "ipd_refund_issue"));
  if (!allowed) throw new ServerActionError("FORBIDDEN", "You do not have permission to issue refunds.");

  const scope = branchScope(ctx);
  const voucher = await prisma.ipdRefundVoucher.findFirst({
    where: { id: voucherId, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!voucher) throw new ServerActionError("NOT_FOUND", "Refund voucher not found.");
  if (voucher.status === "issued") throw new ServerActionError("VALIDATION", "Voucher has already been issued.");
  if (voucher.status !== "pending" && voucher.status !== "approved") throw new ServerActionError("VALIDATION", "Voucher cannot be issued.");

  const wallet = await getIpdWalletBalance(ctx, voucher.admissionId);
  if (Number(voucher.amount) > wallet.balance) {
    throw new ServerActionError("VALIDATION", "Refund amount exceeds available wallet balance.");
  }

  const updated = await prisma.ipdRefundVoucher.update({
    where: { id: voucherId },
    data: { status: "issued", referenceNo: input?.referenceNo ?? voucher.referenceNo },
  });

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_refund_voucher_issued",
    entityType: "ipd_admission",
    entityId: voucher.admissionId,
    summary: `Issued refund voucher ${voucherId} of ${Number(voucher.amount)}`,
    payload: { amount: Number(voucher.amount), referenceNo: input?.referenceNo },
  });

  return {
    id: updated.id,
    admissionId: updated.admissionId,
    patientId: updated.patientId,
    invoiceId: updated.invoiceId,
    amount: Number(updated.amount),
    mode: updated.mode,
    status: updated.status as IpdRefundVoucher["status"],
    approvedBy: updated.approvedBy,
    requestedBy: updated.requestedBy,
    referenceNo: updated.referenceNo,
    notes: updated.notes,
    createdAt: updated.createdAt.toISOString(),
  };
}

export async function directDischargeIpdAdmission(ctx: ServerContext, id: string): Promise<{ id: string }> {
  const allowed = ctx.role === "admin" || (await hasPermission(ctx, "ipd_direct_discharge"));
  if (!allowed) throw new ServerActionError("FORBIDDEN", "You do not have permission for direct discharge.");

  const scope = branchScope(ctx);
  const existing = await prisma.ipdAdmission.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId } });
  if (!existing) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  if (existing.status === "discharged" || existing.status === "deceased") {
    throw new ServerActionError("VALIDATION", "Patient is already discharged.");
  }

  await prisma.ipdAdmission.update({
    where: { id },
    data: { status: "discharged", dischargedAt: new Date(), dischargedBy: ctx.userId },
  });

  await writePlatformAudit({
    ctx,
    module: "ipd",
    action: "ipd_direct_discharge",
    entityType: "ipd_admission",
    entityId: id,
    summary: `Direct discharge executed for admission ${id}`,
    payload: { status: "discharged" },
  });

  return { id };
}

function bytesToDataUrl(bytes: Uint8Array, filename = "document.pdf"): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:application/pdf;base64,${base64}`;
}

export async function generateIpdFinalBillPdf(
  ctx: ServerContext,
  invoiceId: string,
): Promise<{ docId: string; dataUrl: string; invoiceNumber: string }> {
  const receipt = await getVisitReceipt(ctx, "", invoiceId);
  receipt.isIpd = true;
  const pdfBytes = await generateInvoicePdf(receipt);
  const dataUrl = bytesToDataUrl(pdfBytes, `ipd-final-bill-${receipt.invoiceNumber}.pdf`);
  const docId = createId("ipdfbill");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, ...branchScope(ctx) },
    select: { visitId: true, patientId: true },
  });

  let patientId = invoice?.patientId;
  if (!patientId) {
    const patientByUhid = await prisma.patient.findFirst({
      where: { uhid: receipt.patientUhid, ...branchScope(ctx) },
      select: { id: true },
    });
    patientId = patientByUhid?.id;
  }
  if (!patientId) {
    throw new ServerActionError("NOT_FOUND", "Patient not found for this invoice.");
  }

  await prisma.patientDocument.create({
    data: {
      id: docId,
      ...branchScope(ctx),
      patientId,
      visitId: invoice?.visitId ?? null,
      category: "bill",
      label: `IPD final bill · ${receipt.invoiceNumber}`,
      fileName: `ipd-final-bill-${receipt.invoiceNumber}.pdf`,
      mimeType: "application/pdf",
      size: pdfBytes.length,
      fileUrl: dataUrl,
      uploadedBy: ctx.userId ?? null,
    },
  });

  return { docId, dataUrl, invoiceNumber: receipt.invoiceNumber };
}

export async function sendIpdFinalBillOnWhatsApp(
  ctx: ServerContext,
  invoiceId: string,
  recipientPhone?: string,
): Promise<{ ok: boolean; docId: string; detail?: string }> {
  const { docId, invoiceNumber } = await generateIpdFinalBillPdf(ctx, invoiceId);

  let phone = recipientPhone?.trim();
  if (!phone) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, ...branchScope(ctx) },
      include: { patient: { select: { phone: true } } },
    });
    phone = invoice?.patient?.phone ?? "";
  }

  if (!phone) {
    throw new ServerActionError("VALIDATION", "Patient phone number is missing.");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const documentUrl = `${baseUrl}/api/public/ipd-final-bill/${docId}`;
  const caption = `Your IPD final bill ${invoiceNumber} is ready. Please find the attached PDF. Thank you for choosing Candela.`;
  const connection = await getActiveConnection(ctx);
  const connDetails = connection ? {
    accessToken: decryptWhatsAppToken(connection.accessToken),
    phoneNumberId: connection.phoneNumberId,
  } : undefined;

  const result = await deliverWhatsAppDocument(phone, documentUrl, `ipd-final-bill-${invoiceNumber}.pdf`, caption, connDetails);

  return { ok: result.ok, docId, detail: result.detail };
}

export async function admitPatient(ctx: ServerContext, input: IpdAdmissionInput) {
  await ensureHospitalBootstrap();
  const scope = branchScope(ctx);

  if (!input.patientId?.trim()) throw new ServerActionError("VALIDATION", "Select a registered patient.");
  if (!input.doctorId?.trim()) throw new ServerActionError("VALIDATION", "Select an attending doctor.");
  if (!input.departmentId?.trim()) throw new ServerActionError("VALIDATION", "Select a department.");
  if (!input.wardId?.trim()) throw new ServerActionError("VALIDATION", "Select a ward.");
  if (!input.bed?.trim()) throw new ServerActionError("VALIDATION", "Select a bed.");

  const bed = await prisma.ipdBed.findFirst({
    where: { id: input.bed, wardId: input.wardId, branchId: scope.branchId },
    include: { ward: true },
  });
  if (!bed) throw new ServerActionError("VALIDATION", "Selected bed not found.");

  const existingOccupant = await prisma.ipdAdmission.findFirst({
    where: {
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      bedId: bed.id,
      status: { in: ["admitted", "discharge_planned"] },
    },
  });
  if (existingOccupant) {
    throw new ServerActionError("CONFLICT", "Selected bed is already occupied.");
  }

  const patient = await prisma.patient.findFirst({
    where: { id: input.patientId, tenantId: scope.tenantId, branchId: scope.branchId },
    select: { id: true, name: true, fullName: true, uhid: true },
  });
  if (!patient) throw new ServerActionError("NOT_FOUND", "Patient not found in this branch.");
  const patientName = patientDisplayName(patient) ?? input.patientId;

  const roster = await loadClinicalRoster(ctx);
  const doctorName = resolveDoctorName(input.doctorId, roster);
  const departmentLabel = roster.departments.find((d) => d.id === input.departmentId)?.label ?? input.departmentId;

  const visitId = createId("vis");
  const ipdId = `ipd_${visitId}`;
  const now = new Date().toISOString();

  await prisma.$transaction(async (tx) => {
    await tx.opdVisit.create({
      data: {
        id: visitId,
        ...scope,
        patientId: input.patientId,
        stage: "ipd_admitted",
        departmentId: input.departmentId,
        doctorId: input.doctorId,
        doctorName,
        billing: "pending",
        exam: "not_started",
        appointment: false,
        waitMin: 0,
        checkInAt: now,
        treatmentPath: "ipd",
        ipdAdmissionId: ipdId,
        routingNote: `Direct IPD admission from front desk · ${departmentLabel}`,
      },
    });

    await tx.ipdAdmission.create({
      data: {
        id: ipdId,
        ...scope,
        visitId,
        patientId: input.patientId,
        wardId: bed.wardId,
        bedId: bed.id,
        doctorName,
        diagnosis: input.diagnosis,
        patientType: input.patientType ?? "general",
        billingMode: input.billingMode ?? "postpaid",
        expectedDischarge: input.expectedDischarge ? new Date(input.expectedDischarge) : null,
        admittedAt: new Date(),
        attendingDoctorId: input.doctorId,
        status: "admitted",
      },
    });

    const wardLabel = bed.ward.label;
    await tx.nursingHandoff.upsert({
      where: { visitId },
      update: {
        ipdWard: wardLabel,
        ipdBed: bed.label,
      },
      create: {
        id: `nh_${visitId}`,
        visitId,
        patientId: input.patientId,
        patientName,
        uhid: patient.uhid ?? "",
        doctorId: input.doctorId,
        doctorName,
        treatmentPath: "ipd",
        packageId: "",
        packageLabel: "",
        billingStatus: "pending",
        amountPaid: 0,
        balanceDue: 0,
        netAmount: 0,
        commercialConsent: false,
        billingHandoff: Prisma.JsonNull,
        consultation: Prisma.JsonNull,
        ipdWard: wardLabel,
        ipdBed: bed.label,
        sentAt: now,
      },
    });

    const assignedNurse = await findOnDutyNurseForWard(tx, ctx, wardLabel);

    if (assignedNurse) {
      await tx.nursingEpisode.create({
        data: {
          id: `ep_${visitId}`,
          visitId,
          patientId: input.patientId,
          nurseId: assignedNurse.id,
          nurseName: assignedNurse.name,
          branchId: ctx.branchId,
          treatmentPath: "ipd",
          packageLabel: "",
          packageId: "",
          doctorName,
          doctorId: input.doctorId,
          billingStatus: "pending",
          balanceDue: 0,
          status: "queued",
          priority: "high",
          queuedAt: now,
          consents: [],
          sessions: [],
          internalNotes: "",
          tasks: [],
        },
      });
    }
  });

  const opd = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (opd) await syncVisitFromOpdVisit(ctx, opd);

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_admitted",
    entityType: "ipd_admission",
    entityId: ipdId,
    summary: `Admitted ${patientName} to ${bed.ward.label} bed ${bed.label}`,
    payload: {
      ward: bed.ward.label,
      bed: bed.label,
      patientType: input.patientType,
      billingMode: input.billingMode,
    },
  });

  return { id: ipdId, visitId, patientId: input.patientId };
}

export async function updateIpdAdmission(
  ctx: ServerContext,
  id: string,
  patch: {
    status?: IpdAdmissionStatus;
    expectedDischarge?: string;
    diagnosis?: string;
    lastRoundNote?: string;
  },
) {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdAdmission.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!existing) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  if (patch.status === "discharged") {
    if (existing.status === "discharged") {
      throw new ServerActionError("VALIDATION", "Patient is already discharged.");
    }
    await assertIpdDischargeAllowed(ctx, existing);
  }

  const data: Record<string, unknown> = {};
  if (patch.status) data.status = patch.status;
  if (patch.status === "discharged") {
    data.dischargedAt = new Date();
    data.dischargedBy = ctx.userId ?? null;
  }
  if (patch.expectedDischarge !== undefined) data.expectedDischarge = patch.expectedDischarge ? new Date(patch.expectedDischarge) : null;
  if (patch.diagnosis !== undefined) data.diagnosis = patch.diagnosis;
  if (patch.lastRoundNote !== undefined) {
    data.lastRoundNote = patch.lastRoundNote;
    data.lastRoundAt = new Date();
  }

  await prisma.ipdAdmission.update({ where: { id }, data });

  if (patch.status === "discharged" && existing.visitId) {
    await prisma.nursingEpisode.updateMany({
      where: { visitId: existing.visitId },
      data: { status: "completed" },
    });
    await prisma.opdVisit.updateMany({
      where: { id: existing.visitId, tenantId: scope.tenantId, branchId: scope.branchId },
      data: { stage: "completed" },
    });
    const opd = await prisma.opdVisit.findUnique({ where: { id: existing.visitId } });
    if (opd) await syncVisitFromOpdVisit(ctx, opd);
  }

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_updated",
    entityType: "ipd_admission",
    entityId: id,
    summary: `Updated IPD admission ${id}`,
    payload: patch,
  });

  return { id };
}

async function assertIpdDischargeAllowed(
  ctx: ServerContext,
  admission: { id: string; visitId: string | null; cart: unknown; billingMode?: string | null },
) {
  if (!admission.visitId) return;
  const isPostpaid = (admission.billingMode ?? "postpaid") === "postpaid";
  const scope = branchScope(ctx);
  const cart = parseCart(admission.cart);
  if (cart.length > 0) {
    throw new ServerActionError("VALIDATION", "Cannot discharge while services/packages are still in the cart. Clear or bill the cart first.");
  }
  if (isPostpaid) return;
  const visit = await prisma.opdVisit.findFirst({
    where: { id: admission.visitId, tenantId: scope.tenantId, branchId: scope.branchId },
    select: { balanceDue: true, amountPaid: true, billAmount: true },
  });
  const invoices = await prisma.invoice.findMany({
    where: { visitId: admission.visitId, tenantId: scope.tenantId, branchId: scope.branchId },
    select: { balanceAmount: true, amountPaid: true, totalAmount: true },
  });
  const invoiceBalance = invoices.reduce((sum, inv) => sum + Number(inv.balanceAmount ?? 0), 0);
  const invoiceTotal = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount ?? 0), 0);
  const invoicePaid = invoices.reduce((sum, inv) => sum + Number(inv.amountPaid ?? 0), 0);
  const balanceDue = (visit?.balanceDue ?? 0) + invoiceBalance;
  if (balanceDue > 0 || (visit && (visit.amountPaid ?? 0) < (visit.billAmount ?? 0)) || invoicePaid < invoiceTotal) {
    throw new ServerActionError("VALIDATION", "Cannot discharge while IPD bill is unpaid. Complete billing first.");
  }
}

function parseCart(raw: unknown): IpdCartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is IpdCartItem =>
      item &&
      typeof item === "object" &&
      typeof (item as IpdCartItem).id === "string" &&
      typeof (item as IpdCartItem).packageId === "string" &&
      typeof (item as IpdCartItem).label === "string" &&
      typeof (item as IpdCartItem).amount === "number" &&
      typeof (item as IpdCartItem).quantity === "number",
  );
}

type IpdPharmacyInvoiceLinePayload = {
  prescriptionLineId?: string;
  prescriptionLineQty?: number;
};

function billedQtyByPrescriptionLineId(
  invoices: { lines: { category?: string | null; payload?: Prisma.JsonValue | null }[] }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      if (line.category !== "pharmacy") continue;
      const payload = (line.payload ?? {}) as IpdPharmacyInvoiceLinePayload;
      if (!payload.prescriptionLineId) continue;
      const id = payload.prescriptionLineId;
      const qty = payload.prescriptionLineQty ?? 0;
      map.set(id, (map.get(id) ?? 0) + qty);
    }
  }
  return map;
}

export type IpdPharmacyChargeLine = {
  drugId: string;
  label: string;
  quantity: number;
  rate: number;
  purchaseRate: number;
  gstPercent: number;
  taxableAmount: number;
  prescriptionLineId: string;
};

export async function previewIpdFinalBill(
  ctx: ServerContext,
  admissionId: string,
  discount = 0,
) {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  const cart = parseCart(admission.cart);
  if (!cart.length) throw new ServerActionError("VALIDATION", "No services or packages in the IPD cart.");

  const packageLines = cart.map((item) => ({
    packageId: item.packageId,
    label: item.label,
    amount: item.amount,
    quantity: item.quantity,
  }));
  const subtotal = packageLines.reduce((s, line) => s + line.amount * line.quantity, 0);
  const branch = await prisma.branch.findUnique({ where: { id: scope.branchId } });
  const gstInvoice = computeGstInvoice({
    settings: parseBranchGstSettings(branch?.meta),
    lines: packageLines.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      taxableAmount: line.amount * line.quantity,
    })),
    discount,
  });

  return {
    subtotal,
    discount,
    taxableSubtotal: Number(gstInvoice.taxableSubtotal),
    cgstTotal: Number(gstInvoice.cgstTotal),
    sgstTotal: Number(gstInvoice.sgstTotal),
    igstTotal: Number(gstInvoice.igstTotal),
    taxAmount: Number(gstInvoice.taxTotal),
    total: Number(gstInvoice.grandTotal),
    taxRate: Number(gstInvoice.settings.gstRatePercent),
    taxMode: gstInvoice.settings.taxMode,
  };
}

export async function getIpdPharmacyCharges(
  ctx: ServerContext,
  visitId: string,
): Promise<{ lines: IpdPharmacyChargeLine[]; subtotal: number; totalProfit: number }> {
  try {
    const state = await readPharmacyWorkspace(ctx, () => defaultPharmacyState({}));
    const invoices = await prisma.invoice.findMany({
      where: { visitId, ...branchScope(ctx) },
      include: { lines: true },
    });
    const billedQty = billedQtyByPrescriptionLineId(invoices);
    const lines: IpdPharmacyChargeLine[] = [];
    let subtotal = 0;
    let totalProfit = 0;

    for (const rx of state.prescriptions) {
      if (rx.source !== "ipd" || rx.encounterId !== visitId) continue;
      if (!["dispensed", "partially_dispensed"].includes(rx.status)) continue;
      for (const line of rx.lines) {
        if (line.qtyDispensed <= 0) continue;
        const alreadyBilled = billedQty.get(line.id) ?? 0;
        const unbilledQty = line.qtyDispensed - alreadyBilled;
        if (unbilledQty <= 0) continue;
        const drug = state.drugs.find((d) => d.id === line.drugId);
        const batch = state.stock.find((s) => s.id === line.batchId);
        const rate = line.dispenseRate ?? drug?.defaultMrp ?? 0;
        const purchaseRate = batch?.purchaseRate ?? 0;
        const gstPercent = drug?.gstPercent ?? 12;
        const taxableAmount = unbilledQty * rate;
        subtotal += taxableAmount;
        totalProfit += unbilledQty * (rate - purchaseRate);
        lines.push({
          drugId: line.drugId,
          label: drug?.brandName ?? line.drugName ?? line.drugId,
          quantity: unbilledQty,
          rate,
          purchaseRate,
          gstPercent,
          taxableAmount,
          prescriptionLineId: line.id,
        });
      }
    }
    return { lines, subtotal, totalProfit };
  } catch {
    return { lines: [], subtotal: 0, totalProfit: 0 };
  }
}

export async function getIpdCart(ctx: ServerContext, admissionId: string): Promise<IpdCartItem[]> {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
    select: { cart: true },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  return parseCart(admission.cart);
}

export async function addIpdCartItem(
  ctx: ServerContext,
  admissionId: string,
  item: Omit<IpdCartItem, "id" | "addedAt">,
): Promise<IpdCartItem[]> {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  const newItem: IpdCartItem = {
    ...item,
    id: createId("ipdcart"),
    addedAt: new Date().toISOString(),
  };

  const cart = parseCart(admission.cart);
  const existingIndex = cart.findIndex((c) => c.packageId === item.packageId);
  if (existingIndex >= 0) {
    cart[existingIndex] = { ...cart[existingIndex], quantity: cart[existingIndex].quantity + item.quantity };
  } else {
    cart.push(newItem);
  }

  await prisma.ipdAdmission.update({
    where: { id: admissionId },
    data: { cart: cart as unknown as object },
  });

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_cart_item_added",
    entityType: "ipd_admission",
    entityId: admissionId,
    summary: `Added ${item.label} to IPD cart`,
    payload: { item: newItem },
  });

  return cart;
}

export async function updateIpdCartItem(
  ctx: ServerContext,
  admissionId: string,
  itemId: string,
  quantity: number,
): Promise<IpdCartItem[]> {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  const cart = parseCart(admission.cart).map((c) =>
    c.id === itemId ? { ...c, quantity: Math.max(1, quantity) } : c,
  );
  await prisma.ipdAdmission.update({
    where: { id: admissionId },
    data: { cart: cart as unknown as object },
  });

  return cart;
}

export async function removeIpdCartItem(ctx: ServerContext, admissionId: string, itemId: string): Promise<IpdCartItem[]> {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  const cart = parseCart(admission.cart).filter((c) => c.id !== itemId);
  await prisma.ipdAdmission.update({
    where: { id: admissionId },
    data: { cart: cart as unknown as object },
  });

  return cart;
}

export async function createLabOrdersFromIpdRounds(
  ctx: ServerContext,
  tx: Prisma.TransactionClient,
  admissionId: string,
  visitId: string,
  patientId: string,
): Promise<{ orderId?: string; itemCount: number; unmatched: string[] }> {
  const scope = branchScope(ctx);
  const logs = await tx.ipdRoundLog.findMany({
    where: { ...scope, ipdAdmissionId: admissionId, kind: "doctor_round" },
    orderBy: { createdAt: "asc" },
  });

  const catalogs = await tx.labReportCatalog.findMany({
    where: { ...scope, active: true },
    include: { service: { select: { id: true, label: true, category: true, rate: true, gstPercent: true } } },
  });

  const unmatched: string[] = [];
  const allItems: {
    reportCatalogId: string;
    label: string;
    sampleType?: string;
    status: string;
    serviceId?: string;
    price?: number;
    gstPercent?: number;
  }[] = [];
  const cartItems: IpdCartItem[] = [];
  const processedLogIds: string[] = [];
  let actorId = ctx.userId;
  let actorName = ctx.userId;

  for (const log of logs) {
    const payload = log.payload as Record<string, unknown> | null;
    if (payload?.labOrderId) continue;

    const requested = new Set<string>();
    for (const key of ["labReports", "radiologyReports"]) {
      const raw = payload?.[key];
      if (typeof raw === "string" && raw.trim()) {
        raw.split("\n").forEach((line) => {
          const clean = line.replace(/^[-*\d.)]+\s*/, "").trim();
          if (clean) requested.add(clean);
        });
      }
    }

    const logItems: typeof allItems = [];
    const logCartItems: IpdCartItem[] = [];

    for (const line of requested) {
      const normalized = line.toLowerCase();
      let catalog = catalogs.find(
        (c) => c.name.toLowerCase() === normalized || c.code.toLowerCase() === normalized,
      );
      if (!catalog) {
        const candidates = catalogs.filter(
          (c) => c.name.toLowerCase().includes(normalized) || c.code.toLowerCase().includes(normalized),
        );
        if (candidates.length) {
          catalog = candidates.sort((a, b) => a.name.length - b.name.length)[0];
        }
      }
      if (catalog) {
        const service = catalog.service;
        logItems.push({
          reportCatalogId: catalog.id,
          label: catalog.name,
          sampleType: catalog.sampleType ?? undefined,
          status: "ordered",
          serviceId: service?.id,
          price: service?.rate != null ? Number(service.rate) : undefined,
          gstPercent: service?.gstPercent != null ? Number(service.gstPercent) : undefined,
        });
        if (service) {
          logCartItems.push({
            id: createId("ipdcart"),
            type: "service",
            packageId: service.id,
            label: `Lab: ${catalog.name}`,
            amount: Number(service.rate),
            quantity: 1,
            addedAt: new Date().toISOString(),
          });
        }
      } else {
        unmatched.push(line);
      }
    }

    if (logItems.length > 0) {
      allItems.push(...logItems);
      cartItems.push(...logCartItems);
      processedLogIds.push(log.id);
      if (log.actorId) {
        actorId = log.actorId;
        actorName = log.actorName ?? actorId;
      }
    }
  }

  if (allItems.length === 0) return { itemCount: 0, unmatched };

  const admission = await tx.ipdAdmission.findFirst({
    where: { id: admissionId },
    select: { cart: true },
  });
  const existingCart = parseCart(admission?.cart);
  const newCart = [...existingCart, ...cartItems];
  await tx.ipdAdmission.update({
    where: { id: admissionId },
    data: { cart: newCart as unknown as object },
  });

  const order = await tx.labOrder.create({
    data: {
      ...scope,
      patientId,
      visitId,
      admissionId,
      orderedBy: actorId,
      orderedByName: actorName,
      source: "ipd",
      status: "ordered",
      items: { create: allItems },
    },
  });

  for (const logId of processedLogIds) {
    const log = await tx.ipdRoundLog.findFirst({ where: { id: logId }, select: { payload: true } });
    const payload = (log?.payload as Record<string, unknown> | null) ?? {};
    await tx.ipdRoundLog.update({
      where: { id: logId },
      data: { payload: { ...payload, labOrderId: order.id } as unknown as object },
    });
  }

  return { orderId: order.id, itemCount: allItems.length, unmatched };
}

export async function generateIpdFinalBill(
  ctx: ServerContext,
  admissionId: string,
  input: {
    mode?: string;
    paymentSplits?: { mode: string; amount: number }[];
    discount?: number;
  },
) {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
    include: { patient: { select: { id: true, name: true, fullName: true } } },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  const visitId = admission.visitId;
  if (!visitId) throw new ServerActionError("VALIDATION", "Admission is not linked to a visit.");

  const visit = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (!visit) throw new ServerActionError("NOT_FOUND", "Visit not found.");

  const labOrderResult = await createLabOrdersFromIpdRounds(
    ctx,
    prisma,
    admissionId,
    visitId,
    admission.patientId,
  );
  if (labOrderResult.unmatched.length) {
    console.warn("[ipd final bill] Unmatched round lab/radiology orders:", labOrderResult.unmatched);
  }

  const freshAdmission = await prisma.ipdAdmission.findFirst({
    where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
    select: { cart: true },
  });
  const cart = parseCart(freshAdmission?.cart);
  if (!cart.length) throw new ServerActionError("VALIDATION", "No services or packages in the IPD cart.");

  const packageLines = cart.map((item) => ({
    packageId: item.packageId,
    label: item.label,
    amount: item.amount,
    quantity: item.quantity,
  }));

  const subtotal = packageLines.reduce((s, line) => s + line.amount * line.quantity, 0);
  const branch = await prisma.branch.findUnique({ where: { id: scope.branchId } });
  const gstInvoice = computeGstInvoice({
    settings: parseBranchGstSettings(branch?.meta),
    lines: packageLines.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      taxableAmount: line.amount * line.quantity,
    })),
    discount: input.discount ?? 0,
  });
  const net = gstInvoice.grandTotal;

  const wallet = await getIpdWalletBalance(ctx, admissionId);
  const isPataudi = isPataudiBranch(branch?.name);

  let walletUsed = 0;
  let amountPaid = 0;
  let balance = 0;
  let refund = 0;
  let paymentStatus = "";
  let settlementType = "";
  let allSplits: { mode: string; amount: number }[] = [];
  let nonPendingForInvoice: { mode: string; amount: number }[] = [];
  let invoiceMode = "advance";

  const pendingModes = new Set(["due", "pending"]);

  if (isPataudi) {
    // Credit-based IPD final bill for Pataudi: auto-apply available advance, then
    // accept any additional payment modes provided by the front desk for the outstanding balance.
    walletUsed = Math.min(wallet.balance, net);
    const outstandingAfterAdvance = Math.max(0, net - walletUsed);

    const pataudiProvided = (input.paymentSplits ?? []).filter(
      (p) => p.amount > 0 && !pendingModes.has(p.mode) && p.mode !== "advance",
    );
    const extraPaid = Math.min(
      pataudiProvided.reduce((s, p) => s + p.amount, 0),
      outstandingAfterAdvance,
    );

    amountPaid = walletUsed + extraPaid;
    balance = Math.max(0, net - amountPaid);
    refund = Math.max(0, wallet.balance - walletUsed);

    if (refund > 0) {
      paymentStatus = "Refund";
      settlementType = "Refund Pending";
    } else if (balance === 0) {
      paymentStatus = "Paid";
      settlementType = walletUsed > 0 ? "Advance Settlement" : extraPaid > 0 ? "Cash Settlement" : "No Payment";
    } else if (walletUsed > 0 || extraPaid > 0) {
      paymentStatus = "Partial";
      settlementType = walletUsed > 0 ? "Advance Settlement" : "Due";
    } else {
      paymentStatus = "Pending";
      settlementType = "Due";
    }

    const actualSplits: { mode: string; amount: number }[] = [];
    if (walletUsed > 0) actualSplits.push({ mode: "advance", amount: walletUsed });
    if (extraPaid > 0) {
      // Only include the portion of provided splits that actually fits into the outstanding balance.
      let remaining = extraPaid;
      for (const split of pataudiProvided) {
        const take = Math.min(split.amount, remaining);
        if (take > 0) {
          actualSplits.push({ mode: split.mode, amount: take });
          remaining -= take;
        }
      }
    }
    const pendingSplits: { mode: string; amount: number }[] = balance > 0 ? [{ mode: "due", amount: balance }] : [];

    allSplits = [...actualSplits, ...pendingSplits];
    nonPendingForInvoice = actualSplits;
    invoiceMode = nonPendingForInvoice.length === 1 ? nonPendingForInvoice[0].mode : "split";
  } else {
    const pendingModes = new Set(["due", "pending"]);
    const providedSplits = input.paymentSplits?.length ? input.paymentSplits : [];
    const actualSplits = providedSplits.filter((p) => !pendingModes.has(p.mode));
    const pendingSplits = providedSplits.filter((p) => pendingModes.has(p.mode));

    const advanceSplit = actualSplits.find((p) => p.mode === "advance");
    let nonAdvanceActual = actualSplits
      .filter((p) => p.mode !== "advance")
      .reduce((s, p) => s + p.amount, 0);

    if (advanceSplit) {
      walletUsed = Math.min(advanceSplit.amount, wallet.balance);
    } else if (wallet.balance > 0 && nonAdvanceActual < net) {
      walletUsed = Math.min(wallet.balance, net - nonAdvanceActual);
    }

    if (walletUsed > 0 && !advanceSplit) {
      actualSplits.unshift({ mode: "advance", amount: walletUsed });
    } else if (advanceSplit) {
      advanceSplit.amount = walletUsed;
    }

    amountPaid = nonAdvanceActual + walletUsed;
    balance = Math.max(0, net - amountPaid);
    refund = Math.max(0, wallet.balance - walletUsed);

    allSplits = [...actualSplits, ...pendingSplits];
    nonPendingForInvoice = actualSplits.filter((p) => !pendingModes.has(p.mode));
    invoiceMode = nonPendingForInvoice.length === 1 ? nonPendingForInvoice[0].mode : "split";
  }

  const invoiceResult = await prisma.$transaction(async (tx) => {
    const { invoiceId } = await createVisitInvoice(
      ctx,
      {
        visitId,
        patientId: visit.patientId,
        label: packageLines.map((l) => l.label).join(" · ") || "IPD services",
        subtotal,
        discount: input.discount ?? 0,
        collected: amountPaid,
        mode: invoiceMode,
        paymentScope: balance === 0 ? "full" : "partial",
        lines: packageLines.map((line) => ({
          label: line.label,
          quantity: line.quantity,
          taxableAmount: line.amount * line.quantity,
        })),
        paymentSplits: nonPendingForInvoice,
        packageLines,
      },
      tx,
    );

    const existing = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { payload: true } });
    const payload = (existing?.payload as Record<string, unknown> | null) ?? {};
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        refundAmount: refund,
        payload: {
          ...payload,
          paymentSplits: allSplits,
          advanceUsed: walletUsed,
          advanceAvailable: wallet.balance,
          paymentStatus,
          settlementType,
        } as Prisma.InputJsonObject,
      },
    });

    const clearedAdmission = await tx.ipdAdmission.updateMany({
      where: { id: admissionId, tenantId: scope.tenantId, branchId: scope.branchId },
      data: { cart: [] as unknown as object },
    });
    if (clearedAdmission.count !== 1) {
      throw new ServerActionError(
        "NOT_FOUND",
        "This IPD admission is no longer available. Refresh the billing page and select the active admission again.",
      );
    }

    await tx.opdVisit.update({
      where: { id: visitId },
      data: {
        billing: balance === 0 ? "paid" : "partial",
        billAmount: net,
        amountPaid,
        balanceDue: balance > 0 ? balance : null,
      },
    });

    return { invoiceId, labOrderId: labOrderResult.orderId, labOrderItemCount: labOrderResult.itemCount };
  });

  const updated = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (updated) await syncVisitFromOpdVisit(ctx, updated);

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceResult.invoiceId } });
  const patientName = patientDisplayName(admission.patient) ?? admission.patientId;

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_final_bill_generated",
    entityType: "ipd_admission",
    entityId: admissionId,
    summary: `Generated IPD final bill for ${patientName}`,
    payload: {
      total: net,
      amountPaid,
      balance,
      refund,
      advanceUsed: walletUsed,
      visitId,
      labOrderId: invoiceResult.labOrderId,
      labOrderItemCount: invoiceResult.labOrderItemCount,
    },
  });

  return {
    visitId,
    invoiceId: invoiceResult.invoiceId,
    invoiceNumber: invoice?.invoiceNumber ?? `NV-${visitId.slice(-8).toUpperCase()}`,
    total: net,
    amountPaid,
    balanceDue: balance,
    refundAmount: refund,
    labOrderId: invoiceResult.labOrderId,
    labOrderItemCount: invoiceResult.labOrderItemCount,
  };
}

export async function transferIpdAdmission(
  ctx: ServerContext,
  id: string,
  target: { wardId: string; bedId: string },
) {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
    include: { ward: true, bed: true },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  const targetBed = await prisma.ipdBed.findFirst({
    where: { id: target.bedId, wardId: target.wardId, branchId: scope.branchId },
    include: { ward: true },
  });
  if (!targetBed) throw new ServerActionError("VALIDATION", "Target bed not found.");

  const occupant = await prisma.ipdAdmission.findFirst({
    where: {
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      bedId: targetBed.id,
      status: { in: ["admitted", "discharge_planned"] },
      NOT: { id },
    },
  });
  if (occupant) throw new ServerActionError("CONFLICT", "Target bed is already occupied.");

  await prisma.ipdAdmission.update({
    where: { id },
    data: {
      wardId: targetBed.wardId,
      bedId: targetBed.id,
    },
  });

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "ipd_transferred",
    entityType: "ipd_admission",
    entityId: id,
    summary: `Transferred IPD admission from ${admission.ward.label} ${admission.bed.label} to ${targetBed.ward.label} ${targetBed.label}`,
    payload: { fromWardId: admission.wardId, fromBedId: admission.bedId, toWardId: targetBed.wardId, toBedId: targetBed.id },
  });

  return { id };
}

export async function createIpdWard(ctx: ServerContext, input: { label: string; category: string }) {
  await backfillBranchScope(ctx);
  const scope = branchScope(ctx);
  const id = createId("ipdward");
  const ward = await prisma.ipdWard.create({
    data: { id, ...scope, label: input.label, category: input.category },
  });
  return { id: ward.id, label: ward.label, category: ward.category };
}

export async function updateIpdWard(ctx: ServerContext, id: string, input: { label?: string; category?: string; active?: boolean }) {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdWard.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!existing) throw new ServerActionError("NOT_FOUND", "Ward not found.");
  const data: Record<string, unknown> = {};
  if (input.label !== undefined) data.label = input.label;
  if (input.category !== undefined) data.category = input.category;
  if (input.active !== undefined) data.active = input.active;
  await prisma.ipdWard.update({ where: { id }, data });
  return { id };
}

export async function deleteIpdWard(ctx: ServerContext, id: string) {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdWard.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
    include: { beds: { where: { active: true } }, admissions: { where: { status: { in: ["admitted", "discharge_planned"] } } } },
  });
  if (!existing) throw new ServerActionError("NOT_FOUND", "Ward not found.");
  if (existing.admissions.length > 0) throw new ServerActionError("CONFLICT", "Cannot delete ward with active admissions.");
  await prisma.ipdWard.delete({ where: { id } });
  return { id };
}

export async function createIpdBed(ctx: ServerContext, wardId: string, input: { label: string }) {
  const scope = branchScope(ctx);
  const ward = await prisma.ipdWard.findFirst({
    where: { id: wardId, tenantId: scope.tenantId, branchId: scope.branchId },
  });
  if (!ward) throw new ServerActionError("NOT_FOUND", "Ward not found.");
  const id = createId("ipdbed");
  const bed = await prisma.ipdBed.create({
    data: { id, ...scope, wardId, label: input.label },
  });
  return { id: bed.id, label: bed.label };
}

export async function updateIpdBed(ctx: ServerContext, id: string, input: { label?: string; active?: boolean }) {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdBed.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
    include: { admissions: { where: { status: { in: ["admitted", "discharge_planned"] } } } },
  });
  if (!existing) throw new ServerActionError("NOT_FOUND", "Bed not found.");
  if (input.active === false && existing.admissions.length > 0) {
    throw new ServerActionError("CONFLICT", "Cannot deactivate an occupied bed.");
  }
  const data: Record<string, unknown> = {};
  if (input.label !== undefined) data.label = input.label;
  if (input.active !== undefined) data.active = input.active;
  await prisma.ipdBed.update({ where: { id }, data });
  return { id };
}

export async function deleteIpdBed(ctx: ServerContext, id: string) {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdBed.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
    include: { admissions: { where: { status: { in: ["admitted", "discharge_planned"] } } } },
  });
  if (!existing) throw new ServerActionError("NOT_FOUND", "Bed not found.");
  if (existing.admissions.length > 0) throw new ServerActionError("CONFLICT", "Cannot delete an occupied bed.");
  await prisma.ipdBed.delete({ where: { id } });
  return { id };
}

export type DischargeSummaryPayload = {
  admissionDate: string;
  dischargeDate: string;
  diagnosis: string;
  procedures: string;
  medications: string;
  followUp: string;
  notes: string;
  preparedBy: string;
  preparedAt: string;
};

export type DeathSummaryPayload = {
  admissionDate: string;
  deathDate: string;
  diagnosis: string;
  causeOfDeath: string;
  contributingConditions: string;
  procedures: string;
  medications: string;
  notes: string;
  preparedBy: string;
  preparedAt: string;
};

async function loadAdmissionForSummary(ctx: ServerContext, id: string) {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id, tenantId: scope.tenantId, branchId: scope.branchId },
    include: {
      patient: {
        select: {
          id: true,
          name: true,
          fullName: true,
          uhid: true,
          phone: true,
          age: true,
          dateOfBirth: true,
          gender: true,
        },
      },
      ward: true,
      bed: true,
    },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  return admission;
}

export async function generateDischargeSummary(ctx: ServerContext, id: string): Promise<DischargeSummaryPayload> {
  const admission = await loadAdmissionForSummary(ctx, id);
  const patientName = patientDisplayName(admission.patient) ?? admission.patientId;
  const today = new Date().toISOString();
  const rounds = await getIpdRoundLog(ctx, id);

  let ai = {
    diagnosis: admission.diagnosis,
    procedures: "",
    medications: "",
    followUp: "",
    notes: `Discharge summary for ${patientName} admitted under ${admission.doctorName} in ${admission.ward.label} bed ${admission.bed.label}.`,
  };

  try {
    ai = await generateDischargeSummaryFromRounds(
      {
        patientName,
        uhid: admission.patient.uhid,
        age: resolvePatientAge(admission.patient.age, admission.patient.dateOfBirth) || undefined,
        gender: admission.patient.gender ?? undefined,
        ward: admission.ward.label,
        bed: admission.bed.label,
        doctorName: admission.doctorName,
        diagnosis: admission.diagnosis,
        admittedAt: admission.admittedAt.toISOString(),
      },
      rounds,
    );
  } catch (err) {
    console.error("[ipd] AI discharge summary generation failed:", err);
  }

  return {
    admissionDate: admission.admittedAt.toISOString(),
    dischargeDate: today,
    diagnosis: ai.diagnosis,
    procedures: ai.procedures,
    medications: ai.medications,
    followUp: ai.followUp,
    notes: ai.notes,
    preparedBy: ctx.userId ?? "",
    preparedAt: today,
  };
}

export async function saveDischargeSummary(
  ctx: ServerContext,
  id: string,
  summary: DischargeSummaryPayload,
): Promise<{ id: string }> {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdAdmission.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId } });
  if (!existing) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  if (existing.status === "discharged") {
    throw new ServerActionError("VALIDATION", "Patient is already discharged.");
  }
  const summaryId = createId("dsum");
  await prisma.ipdAdmission.update({
    where: { id },
    data: {
      dischargeSummary: summary as unknown as object,
      dischargeSummaryId: summaryId,
    },
  });
  await writePlatformAudit({
    ctx,
    module: "ipd",
    action: "discharge_summary_saved",
    entityType: "ipd_admission",
    entityId: id,
    summary: `Discharge summary saved for IPD admission ${id}`,
  });
  return { id: summaryId };
}

export async function markIpdReadyForDischarge(ctx: ServerContext, id: string): Promise<{ id: string }> {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdAdmission.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId } });
  if (!existing) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  if (!existing.dischargeSummaryId || !existing.dischargeSummary) {
    throw new ServerActionError("VALIDATION", "Discharge summary must be filled before marking ready for discharge.");
  }
  if (existing.status === "discharged") {
    throw new ServerActionError("VALIDATION", "Patient is already discharged.");
  }
  await prisma.ipdAdmission.update({
    where: { id },
    data: { status: "doctor_ready" },
  });
  await writePlatformAudit({
    ctx,
    module: "ipd",
    action: "ipd_ready_for_discharge",
    entityType: "ipd_admission",
    entityId: id,
    summary: `Doctor marked IPD admission ${id} ready for discharge`,
  });
  return { id };
}

export async function generateDeathSummary(ctx: ServerContext, id: string): Promise<DeathSummaryPayload> {
  const admission = await loadAdmissionForSummary(ctx, id);
  const patientName = patientDisplayName(admission.patient) ?? admission.patientId;
  const today = new Date().toISOString();
  const rounds = await getIpdRoundLog(ctx, id);

  let ai = {
    diagnosis: admission.diagnosis,
    causeOfDeath: "",
    contributingConditions: "",
    procedures: "",
    medications: "",
    notes: `Death summary for ${patientName} admitted under ${admission.doctorName} in ${admission.ward.label} bed ${admission.bed.label}.`,
  };

  try {
    ai = await generateDeathSummaryFromRounds(
      {
        patientName,
        uhid: admission.patient.uhid,
        age: resolvePatientAge(admission.patient.age, admission.patient.dateOfBirth) || undefined,
        gender: admission.patient.gender ?? undefined,
        ward: admission.ward.label,
        bed: admission.bed.label,
        doctorName: admission.doctorName,
        diagnosis: admission.diagnosis,
        admittedAt: admission.admittedAt.toISOString(),
      },
      rounds,
    );
  } catch (err) {
    console.error("[ipd] AI death summary generation failed:", err);
  }

  return {
    admissionDate: admission.admittedAt.toISOString(),
    deathDate: today,
    diagnosis: ai.diagnosis,
    causeOfDeath: ai.causeOfDeath,
    contributingConditions: ai.contributingConditions,
    procedures: ai.procedures,
    medications: ai.medications,
    notes: ai.notes,
    preparedBy: ctx.userId ?? "",
    preparedAt: today,
  };
}

export async function saveDeathSummary(
  ctx: ServerContext,
  id: string,
  summary: DeathSummaryPayload,
): Promise<{ id: string }> {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdAdmission.findFirst({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId } });
  if (!existing) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  const summaryId = createId("dths");
  await prisma.ipdAdmission.update({
    where: { id },
    data: {
      deathSummary: summary as unknown as object,
      deathSummaryId: summaryId,
      status: "deceased",
      deathDeclaredAt: new Date(),
      deathDeclaredBy: ctx.userId ?? null,
    },
  });
  await prisma.patient.update({
    where: { id: existing.patientId },
    data: { status: "deceased" },
  });
  await writePlatformAudit({
    ctx,
    module: "ipd",
    action: "death_summary_saved",
    entityType: "ipd_admission",
    entityId: id,
    summary: `Death summary saved for IPD admission ${id}`,
  });
  return { id: summaryId };
}

export type IpdRoundConfig = {
  id: string;
  name: string;
  scheduleAt?: string;
  vitals: string[];
  notes: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type IpdRoundLogEntry = {
  id: string;
  kind: string;
  at: string;
  actorName: string;
  actorRole: string;
  content: string;
  data: Record<string, string | number | boolean> | null;
};

function asRoundConfig(row: {
  id: string;
  name: string;
  scheduleAt: string | null;
  vitals: unknown;
  notes: unknown;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): IpdRoundConfig {
  return {
    id: row.id,
    name: row.name,
    scheduleAt: row.scheduleAt ?? undefined,
    vitals: Array.isArray(row.vitals) ? (row.vitals as string[]) : [],
    notes: Array.isArray(row.notes) ? (row.notes as string[]) : [],
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getIpdRoundConfigs(ctx: ServerContext): Promise<IpdRoundConfig[]> {
  const scope = branchScope(ctx);
  const rows = await prisma.ipdRoundConfig.findMany({
    where: { tenantId: scope.tenantId, branchId: scope.branchId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(asRoundConfig);
}

export async function saveIpdRoundConfig(
  ctx: ServerContext,
  input: Omit<IpdRoundConfig, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<IpdRoundConfig> {
  const scope = branchScope(ctx);
  const id = input.id ?? createId("irc");
  const row = await prisma.ipdRoundConfig.upsert({
    where: { id },
    create: {
      id,
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      name: input.name,
      scheduleAt: input.scheduleAt ?? null,
      vitals: input.vitals as unknown as object,
      notes: input.notes as unknown as object,
      active: input.active ?? true,
    },
    update: {
      name: input.name,
      scheduleAt: input.scheduleAt ?? null,
      vitals: input.vitals as unknown as object,
      notes: input.notes as unknown as object,
      active: input.active ?? true,
    },
  });
  await writePlatformAudit({
    ctx,
    module: "admin",
    action: "ipd_round_config_saved",
    entityType: "ipd_round_config",
    entityId: row.id,
    summary: `IPD round config saved: ${row.name}`,
  });
  return asRoundConfig(row);
}

export async function deleteIpdRoundConfig(ctx: ServerContext, id: string): Promise<void> {
  const scope = branchScope(ctx);
  await prisma.ipdRoundConfig.deleteMany({ where: { id, tenantId: scope.tenantId, branchId: scope.branchId } });
}

export async function writeIpdRoundLog(
  ctx: ServerContext,
  params: {
    ipdAdmissionId?: string;
    visitId?: string;
    kind: string;
    actorId?: string;
    actorName: string;
    actorRole: string;
    content?: string;
    data?: Record<string, string | number | boolean>;
  },
): Promise<IpdRoundLogEntry> {
  const id = createId("ipdlog");
  const row = await prisma.ipdRoundLog.create({
    data: {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      ipdAdmissionId: params.ipdAdmissionId ?? null,
      visitId: params.visitId ?? null,
      kind: params.kind,
      actorId: params.actorId ?? null,
      actorName: params.actorName,
      actorRole: params.actorRole,
      content: params.content ?? null,
      payload: params.data ? (params.data as unknown as object) : Prisma.JsonNull,
    },
  });
  return {
    id: row.id,
    kind: row.kind,
    at: row.createdAt.toISOString(),
    actorName: row.actorName,
    actorRole: row.actorRole,
    content: row.content ?? "",
    data: params.data ?? null,
  };
}

export async function getIpdRoundLog(
  ctx: ServerContext,
  ipdAdmissionId: string,
): Promise<IpdRoundLogEntry[]> {
  const scope = branchScope(ctx);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { id: ipdAdmissionId, tenantId: scope.tenantId, branchId: scope.branchId },
    select: { visitId: true },
  });
  if (!admission) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");

  const logs = await prisma.ipdRoundLog.findMany({
    where: {
      ...branchScope(ctx),
      OR: [{ ipdAdmissionId }, { visitId: admission.visitId ?? undefined }],
    },
    orderBy: { createdAt: "desc" },
  });

  return logs.map((row) => ({
    id: row.id,
    kind: row.kind,
    at: row.createdAt.toISOString(),
    actorName: row.actorName,
    actorRole: row.actorRole,
    content: row.content ?? "",
    data:
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, string | number | boolean>)
        : null,
  }));
}

export async function saveIpdTask(
  ctx: ServerContext,
  ipdId: string,
  input: { text: string; assignee?: string },
): Promise<{ id: string }> {
  const profile = await resolveDoctorProfile(ctx);
  const scope = branchScope(ctx);
  const ipd = await prisma.ipdAdmission.findFirst({ where: { id: ipdId, tenantId: scope.tenantId, branchId: scope.branchId } });
  if (!ipd) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  const log = await writeIpdRoundLog(ctx, {
    ipdAdmissionId: ipdId,
    visitId: ipd.visitId ?? undefined,
    kind: "task",
    actorId: profile.doctorId,
    actorName: profile.name,
    actorRole: "doctor",
    content: input.text,
    data: { assignee: input.assignee ?? "", status: "pending" },
  });
  return { id: log.id };
}

export async function updateIpdTaskStatus(
  ctx: ServerContext,
  taskId: string,
  status: "pending" | "completed",
): Promise<{ id: string }> {
  const scope = branchScope(ctx);
  const existing = await prisma.ipdRoundLog.findFirst({
    where: { id: taskId, tenantId: scope.tenantId, branchId: scope.branchId, kind: "task" },
  });
  if (!existing) throw new ServerActionError("NOT_FOUND", "Task not found.");
  const payload =
    existing.payload && typeof existing.payload === "object" && !Array.isArray(existing.payload)
      ? (existing.payload as Record<string, string | number | boolean>)
      : {};
  await prisma.ipdRoundLog.update({
    where: { id: taskId },
    data: { payload: { ...payload, status } as unknown as object },
  });
  return { id: taskId };
}
