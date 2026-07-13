import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PaymentScope } from "@/lib/billing-routing";
import { computeGstInvoice, parseBranchGstSettings, type GstSettings } from "@/lib/gst-invoicing";
import { createVisitInvoice } from "@/server/invoicing";
import type { ServerContext } from "@/server/context";
import { branchScope } from "@/server/tenancy";
import { sendWhatsAppAsync } from "@/server/whatsapp/service";

export type BillableLine = {
  packageId?: string;
  label: string;
  amount: number;
  quantity: number;
  category?: string;
  gstRatePercent?: number;
  prescriptionLineId?: string;
  prescriptionLineQty?: number;
};

export type BillingLedger = {
  previousBillAmount: number;
  previousAmountPaid: number;
  previousBalance: number;
  currentNet: number;
  currentCollected: number;
  newBillAmount: number;
  newAmountPaid: number;
  newBalance: number;
  isFinal: boolean;
  isCurrentBillPaid: boolean;
};

export type Allocation = {
  serviceCollected: number;
  pharmacyCollected: number;
};

export function computeBillingLedger(input: {
  previousBillAmount: number;
  previousAmountPaid: number;
  previousBalance: number;
  currentNet: number;
  splitsTotal: number;
  paymentScope: PaymentScope;
  skipBilling: boolean;
}): BillingLedger {
  const currentCollected =
    input.skipBilling || input.paymentScope === "defer"
      ? 0
      : Math.min(input.splitsTotal, input.previousBalance + input.currentNet);

  const newBillAmount = input.previousBillAmount + input.currentNet;
  const newAmountPaid = input.previousAmountPaid + currentCollected;
  const newBalance = Math.max(0, newBillAmount - newAmountPaid);
  const isFinal = newBalance === 0 && newAmountPaid > 0;

  const paysCurrentBillInFull = input.currentNet > 0 && currentCollected >= input.currentNet;
  const clearsOutstandingBalance =
    input.currentNet === 0 &&
    input.previousBalance > 0 &&
    currentCollected >= input.previousBalance;
  const isCurrentBillPaid =
    !input.skipBilling &&
    input.paymentScope !== "defer" &&
    (paysCurrentBillInFull || clearsOutstandingBalance);

  return {
    previousBillAmount: input.previousBillAmount,
    previousAmountPaid: input.previousAmountPaid,
    previousBalance: input.previousBalance,
    currentNet: input.currentNet,
    currentCollected,
    newBillAmount,
    newAmountPaid,
    newBalance,
    isFinal,
    isCurrentBillPaid,
  };
}

export function allocateCollection(input: {
  currentCollected: number;
  serviceNet: number;
  pharmacyNet: number;
  skipBilling: boolean;
  paymentScope: PaymentScope;
}): Allocation {
  const combinedNet = input.serviceNet + input.pharmacyNet;
  if (combinedNet <= 0 || input.skipBilling || input.paymentScope === "defer") {
    return { serviceCollected: input.currentCollected, pharmacyCollected: 0 };
  }
  const serviceCollected = Math.round((input.currentCollected * input.serviceNet) / combinedNet);
  const pharmacyCollected = input.currentCollected - serviceCollected;
  return { serviceCollected, pharmacyCollected };
}

export type ServiceInvoiceInput = {
  ctx: ServerContext;
  tx: Prisma.TransactionClient;
  visitId: string;
  patientId: string;
  label: string;
  subtotal: number;
  discount: number;
  discountMode?: "amount" | "percent";
  discountPercent?: number;
  collected: number;
  mode: string;
  paymentScope: string;
  lines: BillableLine[];
  paymentSplits: { mode: string; amount: number }[];
  gstOverride: Partial<Pick<GstSettings, "gstRatePercent" | "taxMode">>;
  packageLines?: { packageId: string; label: string; amount: number; quantity: number }[];
};

export async function createServiceInvoice(input: ServiceInvoiceInput) {
  return createVisitInvoice(
    input.ctx,
    {
      visitId: input.visitId,
      patientId: input.patientId,
      label: input.label,
      subtotal: input.subtotal,
      discount: input.discount,
      discountMode: input.discountMode,
      discountPercent: input.discountPercent,
      collected: input.collected,
      mode: input.mode,
      paymentScope: input.paymentScope,
      lines: input.lines.map((line) => ({
        label: line.label,
        quantity: line.quantity,
        taxableAmount: line.amount * line.quantity,
        category: line.category,
        gstRatePercent: line.gstRatePercent,
        prescriptionLineId: line.prescriptionLineId,
        prescriptionLineQty: line.prescriptionLineQty,
      })),
      paymentSplits: input.paymentSplits,
      gstOverride: input.gstOverride,
      packageLines: input.packageLines,
    },
    input.tx,
  );
}

export type PharmacyInvoiceInput = {
  ctx: ServerContext;
  tx: Prisma.TransactionClient;
  visitId: string;
  patientId: string;
  subtotal: number;
  collected: number;
  mode: string;
  lines: BillableLine[];
  paymentSplits: { mode: string; amount: number }[];
};

export async function createPharmacyInvoice(input: PharmacyInvoiceInput) {
  return createVisitInvoice(
    input.ctx,
    {
      visitId: input.visitId,
      patientId: input.patientId,
      label: "IPD pharmacy supplies",
      subtotal: input.subtotal,
      discount: 0,
      collected: input.collected,
      mode: input.mode,
      paymentScope: "full",
      lines: input.lines.map((line) => ({
        label: `${line.label} (${line.quantity})`,
        quantity: line.quantity,
        taxableAmount: line.amount * line.quantity,
        category: "pharmacy" as const,
        gstRatePercent: line.gstRatePercent,
        prescriptionLineId: line.prescriptionLineId,
        prescriptionLineQty: line.quantity,
      })),
      paymentSplits: input.paymentSplits,
      gstOverride: { taxMode: "cgst_sgst", gstRatePercent: 0 },
    },
    input.tx,
  );
}

export type UpdateVisitBillingInput = {
  ctx: ServerContext;
  tx: Prisma.TransactionClient;
  visitId: string;
  patientId: string;
  ledger: BillingLedger;
  route: {
    stage: string;
    billing: string;
    routingNote: string;
  };
  treatmentPath: string;
  token?: number;
  deferredReason?: string;
  doctorId?: string;
  doctorName?: string;
  clearIpdCartForAdmissionId?: string | null;
};

export async function updateVisitBillingState(input: UpdateVisitBillingInput) {
  const { ledger, route, treatmentPath, token, deferredReason, doctorId, doctorName } = input;
  const balanceDelta = ledger.newBalance - ledger.previousBalance;

  await input.tx.patient.update({
    where: { id: input.patientId },
    data: { balance: { increment: balanceDelta } },
  });

  await input.tx.opdVisit.update({
    where: { id: input.visitId },
    data: {
      stage: route.stage,
      billing: route.billing,
      token,
      billAmount: ledger.newBillAmount,
      amountPaid: ledger.newAmountPaid,
      balanceDue: ledger.newBalance > 0 ? ledger.newBalance : null,
      treatmentPath,
      routingNote: route.routingNote,
      deferredReason: route.billing === "deferred" ? deferredReason ?? "Billing skipped / deferred for this patient" : null,
      tenantId: input.ctx.tenantId,
      branchId: input.ctx.branchId,
      ...(doctorId ? { doctorId, doctorName } : {}),
    },
  });

  if (input.clearIpdCartForAdmissionId) {
    await input.tx.ipdAdmission.update({
      where: { id: input.clearIpdCartForAdmissionId },
      data: { cart: [] as unknown as object },
    });
  }
}

export type BalanceInvoiceInput = {
  ctx: ServerContext;
  tx: Prisma.TransactionClient;
  visitId: string;
  patientId: string;
  outstandingBalance: number;
  collected: number;
  mode: string;
  paymentSplits: { mode: string; amount: number }[];
};

export async function createBalanceInvoice(input: BalanceInvoiceInput) {
  return createVisitInvoice(
    input.ctx,
    {
      visitId: input.visitId,
      patientId: input.patientId,
      label: "Outstanding balance payment",
      subtotal: input.outstandingBalance,
      discount: 0,
      collected: input.collected,
      mode: input.mode,
      paymentScope: "full",
      gstOverride: { taxMode: "exempt", gstRatePercent: 0 },
      lines: [
        {
          label: "Outstanding balance",
          quantity: 1,
          taxableAmount: input.outstandingBalance,
          category: "opd" as const,
        },
      ],
      paymentSplits: input.paymentSplits,
    },
    input.tx,
  );
}

export async function sendBillingInvoiceWhatsApp(
  ctx: ServerContext,
  visitId: string,
  patientId: string,
  amount: number,
  invoiceNumber: string,
) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient?.phone) return;
  await sendWhatsAppAsync(ctx, "billing_invoice", patient.phone, {
    patientName: patient.name ?? patient.fullName ?? "Patient",
    invoiceNumber,
    amount,
    paymentStatus: "Paid",
    balanceDue: 0,
  });
}

export function computeGstForLines(
  branchMeta: unknown,
  lines: { label: string; quantity: number; taxableAmount: number; gstRatePercent?: number; category?: string }[],
  discount: number,
  gstOverride?: Partial<Pick<GstSettings, "gstRatePercent" | "taxMode">>,
) {
  const baseGst = parseBranchGstSettings(branchMeta);
  const settings: GstSettings = {
    ...baseGst,
    gstRatePercent: gstOverride?.gstRatePercent ?? baseGst.gstRatePercent,
    taxMode: gstOverride?.taxMode ?? baseGst.taxMode,
  };
  return computeGstInvoice({ settings, lines, discount });
}

export function buildInvoicePaymentSplits(
  collected: number,
  totalAllocated: number,
  originalSplits: { mode: string; amount: number }[],
): { mode: string; amount: number }[] {
  if (totalAllocated <= 0) return [];
  return originalSplits
    .map((split) => ({
      ...split,
      amount: Math.round((split.amount * collected) / totalAllocated),
    }))
    .filter((split) => split.amount > 0);
}
