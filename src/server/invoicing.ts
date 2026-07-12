import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { OpdReceiptPayload } from "@/lib/opd-receipt";
import { receiptFromGstBreakdown } from "@/lib/opd-receipt";
import { computeGstInvoice, parseBranchGstSettings, type GstSettings } from "@/lib/gst-invoicing";
import { patientDisplayName } from "@/lib/frontdesk-workflow";
import { parsePatientRegistrationMeta } from "@/lib/registration-meta";
import type { ServerContext } from "@/server/context";
import { branchScope } from "@/server/tenancy";
import { ServerActionError } from "@/server/errors";

export async function getVisitInvoiceForBilling(ctx: ServerContext, visitId: string) {
  const scope = branchScope(ctx);
  const invoice = await prisma.invoice.findFirst({
    where: { visitId, ...scope },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { paidAt: "asc" } },
    },
  });
  if (!invoice) return null;
  const payload = (invoice.payload as Record<string, unknown> | null) ?? {};
  return {
    status: invoice.status,
    totalAmount: Number(invoice.totalAmount),
    amountPaid: Number(invoice.amountPaid),
    balanceAmount: Number(invoice.balanceAmount),
    subtotal: Number(invoice.subtotal),
    discount: Number(invoice.discount),
    taxAmount: Number(invoice.taxAmount),
    paymentScope: invoice.paymentScope,
    paymentMode: invoice.payments[0]?.mode ?? "",
    paymentSplits: (payload.paymentSplits ?? []) as { mode: string; amount: number }[],
    packageLines: (payload.packageLines ?? []) as {
      packageId: string;
      label: string;
      amount: number;
      quantity: number;
    }[],
    lines: invoice.lines.map((l) => ({
      label: l.label,
      quantity: l.quantity,
      unitPrice: Number(l.unitPrice),
      taxPercent: Number(l.taxPercent),
      lineTotal: Number(l.lineTotal),
    })),
    gst: payload.gst as Record<string, unknown> | undefined,
    discountMode: payload.discountMode as "amount" | "percent" | undefined,
    discountPercent: payload.discountPercent as number | undefined,
  };
}

export async function createVisitInvoice(
  ctx: ServerContext,
  input: {
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
    lines?: { label: string; quantity: number; taxableAmount: number; category?: string; gstRatePercent?: number }[];
    paymentSplits?: { mode: string; amount: number }[];
    gstOverride?: Partial<Pick<GstSettings, "gstRatePercent" | "taxMode">>;
    packageLines?: { packageId: string; label: string; amount: number; quantity: number }[];
  },
  tx: Prisma.TransactionClient = prisma,
) {
  const scope = branchScope(ctx);
  const branch = await tx.branch.findUnique({ where: { id: scope.branchId } });
  const baseGst = parseBranchGstSettings(branch?.meta);
  const gstSettings: GstSettings = {
    ...baseGst,
    gstRatePercent: input.gstOverride?.gstRatePercent ?? baseGst.gstRatePercent,
    taxMode: input.gstOverride?.taxMode ?? baseGst.taxMode,
  };

  const invoiceLines =
    input.lines?.length
      ? input.lines
      : [{ label: input.label, quantity: 1, taxableAmount: input.subtotal }];

  const gstInvoice = computeGstInvoice({
    settings: gstSettings,
    lines: invoiceLines,
    discount: input.discount,
  });

  const net = gstInvoice.grandTotal;
  const balance = Math.max(0, net - input.collected);
  const timestamp = Date.now();
  const invoiceId = `inv_${input.visitId}_${timestamp}`;
  const invoiceNumber = `NV-${input.visitId.slice(-8).toUpperCase()}-${timestamp.toString(36).slice(-4)}`;

  await tx.invoice.create({
    data: {
      id: invoiceId,
      ...scope,
      patientId: input.patientId,
      visitId: input.visitId,
      invoiceNumber,
      status: balance > 0 ? "partial" : input.collected > 0 ? "paid" : "pending",
      subtotal: gstInvoice.taxableSubtotal,
      discount: input.discount,
      taxAmount: gstInvoice.taxTotal,
      totalAmount: net,
      amountPaid: input.collected,
      balanceAmount: balance,
      paymentScope: input.paymentScope,
      payload: {
        gst: gstSettings,
        cgstTotal: gstInvoice.cgstTotal,
        sgstTotal: gstInvoice.sgstTotal,
        igstTotal: gstInvoice.igstTotal,
        paymentSplits: input.paymentSplits ?? [],
        discountMode: input.discountMode,
        discountPercent: input.discountPercent,
        packageLines: input.packageLines ?? [],
      },
    },
  });

  for (const [i, line] of gstInvoice.lines.entries()) {
    await tx.invoiceLine.create({
      data: {
        id: `line_${input.visitId}_${timestamp}_${i}`,
        invoiceId,
        label: line.label,
        category: line.category ?? "opd",
        quantity: line.quantity,
        unitPrice: invoiceLines[i]?.taxableAmount ?? line.taxableAmount,
        taxPercent: line.gstRatePercent,
        lineTotal: line.lineTotal,
        payload: {
          sacCode: line.sacCode,
          cgst: line.cgst,
          sgst: line.sgst,
          igst: line.igst,
          taxableAmount: line.taxableAmount,
          grossTaxable: invoiceLines[i]?.taxableAmount ?? line.taxableAmount,
        },
      },
    });
  }

  const splits =
    input.paymentSplits?.filter((p) => p.amount > 0) ??
    (input.collected > 0 ? [{ mode: input.mode, amount: input.collected }] : []);

  if (splits.length > 0) {
    for (const [index, split] of splits.entries()) {
      await tx.payment.create({
        data: {
          id: `pay_${input.visitId}_${timestamp}_${index}`,
          ...scope,
          invoiceId,
          amount: split.amount,
          mode: split.mode,
          status: "captured",
          referenceNo: `${split.mode.toUpperCase()}-${timestamp}-${index}`,
          paidAt: new Date(),
        },
      });
    }
  }

  return { invoiceId, invoiceNumber, status: balance > 0 ? "partial" : input.collected > 0 ? "paid" : "pending" };
}

const VALID_PAYMENT_MODES = new Set(["cash", "card", "upi", "netbanking", "cheque", "wallet", "other"]);

export async function getVisitReceipt(ctx: ServerContext, visitId: string, invoiceId?: string): Promise<OpdReceiptPayload> {
  const include = {
    lines: { orderBy: { createdAt: "asc" } as const },
    payments: { orderBy: { paidAt: "desc" } as const, take: 1 },
  };
  type InvoiceWithLines = Prisma.InvoiceGetPayload<{ include: typeof include }>;
  let invoice: InvoiceWithLines | null = null;

  if (invoiceId) {
    invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, ...branchScope(ctx) },
      include,
    });
    if (!invoice || !invoice.visitId) {
      throw new ServerActionError("NOT_FOUND", "Invoice not found in your branch.");
    }
    visitId = invoice.visitId;
  }

  const visit = await prisma.opdVisit.findFirst({
    where: { id: visitId, ...branchScope(ctx) },
  });
  if (!visit) {
    const anyVisit = await prisma.opdVisit.findUnique({
      where: { id: visitId },
      select: { branchId: true, tenantId: true },
    });
    console.error("[getVisitReceipt] visit not in branch", {
      visitId,
      expectedBranch: ctx.branchId,
      expectedTenant: ctx.tenantId,
      actualBranch: anyVisit?.branchId,
      actualTenant: anyVisit?.tenantId,
    });
    throw new ServerActionError(
      "NOT_FOUND",
      `Receipt visit not found in your branch (visit ${visitId}, branch ${ctx.branchId}).`,
    );
  }
  if (!visit.patientId) {
    throw new ServerActionError("NOT_FOUND", "Visit is not linked to a patient.");
  }

  const patient = await prisma.patient.findUnique({ where: { id: visit.patientId } });
  if (!patient) {
    throw new ServerActionError("NOT_FOUND", "Patient not found.");
  }

  const reg = parsePatientRegistrationMeta(patient.meta);

  const branch = await prisma.branch.findUnique({ where: { id: ctx.branchId } });
  const branchGst = parseBranchGstSettings(branch?.meta);

  if (!invoice) {
    invoice = await prisma.invoice.findFirst({
      where: { visitId, ...branchScope(ctx) },
      orderBy: { createdAt: "desc" },
      include: {
        lines: { orderBy: { createdAt: "asc" } },
        payments: { orderBy: { paidAt: "desc" }, take: 1 },
      },
    });
  }

  const amountPaid = Number(invoice?.amountPaid ?? visit.amountPaid ?? 0);
  const balanceDue = Number(invoice?.balanceAmount ?? visit.balanceDue ?? 0);
  const latestPayment = invoice?.payments[0];
  const rawPaymentMode = String(latestPayment?.mode ?? "").toLowerCase();
  const normalizedPaymentMode = VALID_PAYMENT_MODES.has(rawPaymentMode) ? rawPaymentMode : "cash";

  const base = {
    invoiceNumber: invoice?.invoiceNumber ?? `NV-${visitId.slice(-8).toUpperCase()}`,
    issuedAt: (invoice?.createdAt ?? visit.updatedAt ?? new Date()).toISOString(),
    patientName: patientDisplayName(patient),
    patientUhid: patient.uhid,
    patientPhone: patient.phone,
    patientCity: reg.city,
    patientDistrict: reg.district,
    appointmentCenter: reg.appointmentCentre || branch?.name || undefined,
    doctorName: visit.doctorName || "Consultant",
    token: visit.token ?? undefined,
    billingStatus: visit.billing ?? "pending",
    paymentScope: invoice?.paymentScope ?? undefined,
    paymentMode: normalizedPaymentMode,
    amountPaid,
    balanceDue,
    routingNote: visit.routingNote ?? undefined,
  };

  if (invoice?.lines.length) {
    const invPayload = (invoice.payload as Record<string, unknown> | null) ?? {};
    const storedGst =
      invPayload.gst && typeof invPayload.gst === "object" && !Array.isArray(invPayload.gst)
        ? ({ ...branchGst, ...(invPayload.gst as Record<string, unknown>) } as typeof branchGst)
        : branchGst;

    const lines = invoice.lines.map((line) => {
      const lp =
        line.payload && typeof line.payload === "object" && !Array.isArray(line.payload)
          ? (line.payload as Record<string, unknown>)
          : {};
      const cgst = Number(lp.cgst ?? 0);
      const sgst = Number(lp.sgst ?? 0);
      const igst = Number(lp.igst ?? 0);
      const lineTotal = Number(line.lineTotal);
      const grossTaxable = Number(lp.grossTaxable ?? Number(line.unitPrice) * line.quantity);
      const taxableAmount = Number(lp.taxableAmount ?? lineTotal - cgst - sgst - igst);

      return {
        label: line.label,
        quantity: line.quantity,
        lineTotal,
        rate: line.quantity > 0 ? grossTaxable / line.quantity : grossTaxable,
        taxableAmount,
        sacCode: String(lp.sacCode ?? storedGst.sacCode),
        gstRatePercent: Number(line.taxPercent ?? 0),
        cgst,
        sgst,
        igst,
      };
    });

    return {
      ...base,
      gst: storedGst,
      placeOfSupply: storedGst.placeOfSupply,
      isTaxInvoice: true,
      lines,
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount ?? 0),
      discountMode:
        invPayload.discountMode === "percent" || invPayload.discountMode === "amount"
          ? invPayload.discountMode
          : undefined,
      discountPercent:
        invPayload.discountPercent != null ? Number(invPayload.discountPercent) : undefined,
      total: Number(invoice.totalAmount),
      cgstTotal: Number(invPayload.cgstTotal ?? 0),
      sgstTotal: Number(invPayload.sgstTotal ?? 0),
      igstTotal: Number(invPayload.igstTotal ?? 0),
      taxTotal: Number(invoice.taxAmount ?? 0),
    };
  }

  const visitBillAmount = Number(visit.billAmount ?? 0);
  const visitDiscount = Number(invoice?.discount ?? 0);
  const gstRate = branchGst.gstRatePercent;

  // visit.billAmount is the GST-inclusive grand total, not the taxable amount.
  // Use stored invoice subtotal if available, otherwise reverse-calculate
  // the tax-exclusive amount to avoid double taxation.
  const fallbackTaxable = invoice?.subtotal
    ? Number(invoice.subtotal)
    : gstRate > 0
      ? Math.round((visitBillAmount / (1 + gstRate / 100)) * 100) / 100
      : visitBillAmount;

  const gstInvoice = computeGstInvoice({
    settings: branchGst,
    lines: [
      {
        label: visit.counselPackageLabel ?? "OPD consultation & services",
        quantity: 1,
        taxableAmount: fallbackTaxable,
      },
    ],
    discount: visitDiscount,
  });

  return receiptFromGstBreakdown(
    {
      ...base,
      discount: visitDiscount,
    },
    gstInvoice,
  );
}

export async function getPatientInvoices(ctx: ServerContext, patientId: string) {
  const scope = branchScope(ctx);
  const invoices = await prisma.invoice.findMany({
    where: { patientId, ...scope },
    orderBy: { createdAt: "desc" },
    include: {
      visit: { select: { id: true, treatmentPath: true } },
      payments: { orderBy: { paidAt: "asc" } },
      lines: { select: { category: true } },
    },
  });
  return invoices.map((inv) => ({
    id: inv.id,
    visitId: inv.visitId,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    paymentScope: inv.paymentScope,
    totalAmount: Number(inv.totalAmount),
    amountPaid: Number(inv.amountPaid),
    balanceAmount: Number(inv.balanceAmount),
    createdAt: inv.createdAt.toISOString(),
    treatmentPath: inv.visit?.treatmentPath,
    hasPharmacy: inv.lines.some((l) => l.category === "pharmacy"),
    payments: inv.payments.map((p) => ({ mode: p.mode, amount: Number(p.amount), paidAt: p.paidAt ? p.paidAt.toISOString() : null })),
  }));
}
