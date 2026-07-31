import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { OpdReceiptPayload, PackageLineNote } from "@/lib/opd-receipt";
import { receiptFromGstBreakdown } from "@/lib/opd-receipt";
import { computeGstInvoice, parseBranchGstSettings, type GstSettings } from "@/lib/gst-invoicing";
import { patientDisplayName, resolvePatientAge } from "@/lib/frontdesk-workflow";
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
      description?: string;
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
    lines?: {
      label: string;
      quantity: number;
      taxableAmount: number;
      category?: string;
      gstRatePercent?: number;
      prescriptionLineId?: string;
      prescriptionLineQty?: number;
    }[];
    paymentSplits?: { mode: string; amount: number }[];
    gstOverride?: Partial<Pick<GstSettings, "gstRatePercent" | "taxMode">>;
    packageLines?: { packageId: string; label: string; amount: number; quantity: number; description?: string }[];
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
          prescriptionLineId: invoiceLines[i]?.prescriptionLineId,
          prescriptionLineQty: invoiceLines[i]?.prescriptionLineQty,
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

const VALID_PAYMENT_MODES = new Set(["cash", "card", "upi", "netbanking", "cheque", "wallet", "advance", "other"]);

export async function getVisitReceipt(ctx: ServerContext, visitId: string, invoiceId?: string): Promise<OpdReceiptPayload> {
  if (invoiceId) {
    const invoiceRef = await prisma.invoice.findFirst({
      where: { id: invoiceId, ...branchScope(ctx) },
      select: { visitId: true },
    });
    if (!invoiceRef || !invoiceRef.visitId) {
      throw new ServerActionError("NOT_FOUND", "Invoice not found in your branch.");
    }
    visitId = invoiceRef.visitId;
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
  const age = resolvePatientAge(patient.age, patient.dateOfBirth ? patient.dateOfBirth.toISOString() : undefined);
  const genderMap: Record<string, string> = {
    M: "Male",
    F: "Female",
    O: "Other",
    male: "Male",
    female: "Female",
    other: "Other",
    prefer_not: "Other",
  };
  const patientGender = patient.gender ? genderMap[patient.gender] ?? patient.gender : undefined;
  const patientAddress = reg.address || [reg.city, reg.district].filter(Boolean).join(", ") || undefined;
  const visitTypeTag = patient.tags.find((t) => ["opd", "followup", "procedure"].includes(t));
  const patientType = visitTypeTag === "followup" ? "OLD PATIENT" : visitTypeTag === "procedure" ? "PROCEDURE" : "NEW PATIENT";

  const branch = await prisma.branch.findUnique({ where: { id: ctx.branchId } });
  const branchGst = parseBranchGstSettings(branch?.meta);

  const allInvoices = await prisma.invoice.findMany({
    where: { visitId, ...branchScope(ctx) },
    orderBy: { createdAt: "asc" },
    include: {
      lines: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { paidAt: "desc" }, take: 1 },
    },
  });

  let requestedInvoice: typeof allInvoices[number] | null = null;
  if (invoiceId) {
    requestedInvoice = allInvoices.find((inv) => inv.id === invoiceId) ?? null;
    if (!requestedInvoice) {
      throw new ServerActionError("NOT_FOUND", "Invoice not found in your branch.");
    }
  }

  // Group invoices into billing sessions. Each service invoice (with packageLines)
  // starts a new session; following balance-only invoices belong to that session.
  // The receipt should reflect only the latest session, not cumulative visit totals.
  type InvoiceSession = {
    serviceInvoice: typeof allInvoices[number] | null;
    invoices: typeof allInvoices;
  };
  const sessions: InvoiceSession[] = [];
  let currentSession: InvoiceSession | null = null;
  for (const inv of allInvoices) {
    const invPayload = (inv.payload as Record<string, unknown> | null) ?? {};
    const packageLines = invPayload.packageLines;
    const isService = Array.isArray(packageLines) && packageLines.length > 0;
    if (isService) {
      if (currentSession) sessions.push(currentSession);
      currentSession = { serviceInvoice: inv, invoices: [inv] };
    } else if (currentSession) {
      currentSession.invoices.push(inv);
    } else {
      sessions.push({ serviceInvoice: null, invoices: [inv] });
    }
  }
  if (currentSession) sessions.push(currentSession);

  // If a specific invoice was requested, use its session; otherwise the latest session.
  const targetSession = (() => {
    if (requestedInvoice) {
      const requestedSession = sessions.find((s) => s.invoices.some((inv) => inv.id === requestedInvoice!.id));
      if (requestedSession) return requestedSession;
    }
    return sessions[sessions.length - 1] ?? null;
  })();

  const receiptInvoice = targetSession?.serviceInvoice ?? requestedInvoice ?? allInvoices[allInvoices.length - 1] ?? null;
  const sessionInvoices = targetSession?.invoices ?? (receiptInvoice ? [receiptInvoice] : []);
  const admission = await prisma.ipdAdmission.findFirst({
    where: { visitId, ...branchScope(ctx) },
    select: { id: true },
  });
  const advancePayments = admission
    ? await prisma.ipdAdvancePayment.findMany({
        where: {
          admissionId: admission.id,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          status: "received",
        },
        orderBy: { receivedAt: "asc" },
        select: {
          id: true,
          amount: true,
          receivedAmount: true,
          mode: true,
          status: true,
          referenceNo: true,
          receivedAt: true,
        },
      })
    : [];

  // Use the current bill/session totals, not the cumulative visit totals.
  const receiptTotal = Number(receiptInvoice?.totalAmount ?? visit.billAmount ?? 0);
  const aggregateAmountPaid = sessionInvoices.reduce(
    (sum, inv) => sum + Number(inv.amountPaid ?? 0),
    0,
  );
  const aggregateBalanceDue = Math.max(0, receiptTotal - aggregateAmountPaid);

  const latestPayment = sessionInvoices
    .flatMap((inv) => inv.payments)
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())[0];
  const rawPaymentMode = String(latestPayment?.mode ?? "").toLowerCase();
  const normalizedPaymentMode = VALID_PAYMENT_MODES.has(rawPaymentMode) ? rawPaymentMode : "cash";

  const receiptPackageLines: PackageLineNote[] = (() => {
    const invPayload = (receiptInvoice?.payload as Record<string, unknown> | null) ?? {};
    const raw = invPayload.packageLines;
    if (!Array.isArray(raw)) return [];
    return raw.map((p: unknown) => {
      const item = typeof p === "object" && p !== null ? (p as Record<string, unknown>) : {};
      return {
        packageId: String(item.packageId ?? ""),
        label: String(item.label ?? ""),
        amount: Number(item.amount ?? 0),
        quantity: Number(item.quantity ?? 1),
        description: item.description ? String(item.description) : undefined,
      };
    });
  })();

  const paymentBreakdown: { mode: string; amount: number }[] = (() => {
    const totals = new Map<string, number>();
    for (const inv of sessionInvoices) {
      const invPayload = (inv.payload as Record<string, unknown> | null) ?? {};
      const splits = invPayload.paymentSplits;
      if (Array.isArray(splits)) {
        for (const split of splits) {
          if (typeof split !== "object" || split === null) continue;
          const s = split as Record<string, unknown>;
          const mode = String(s.mode ?? "").toLowerCase();
          const amount = Number(s.amount ?? 0);
          if (mode && amount > 0) {
            totals.set(mode, (totals.get(mode) ?? 0) + amount);
          }
        }
      }
      for (const payment of inv.payments) {
        const mode = String(payment.mode ?? "").toLowerCase();
        const amount = Number(payment.amount ?? 0);
        if (mode && amount > 0 && !totals.has(mode)) {
          totals.set(mode, (totals.get(mode) ?? 0) + amount);
        }
      }
    }
    if (totals.size === 0) return [];
    return Array.from(totals.entries())
      .map(([mode, amount]) => ({ mode, amount }))
      .sort((a, b) => b.amount - a.amount);
  })();

  const base = {
    branchId: ctx.branchId,
    patientId: patient.id,
    visitId,
    invoiceNumber: receiptInvoice?.invoiceNumber ?? `NV-${visitId.slice(-8).toUpperCase()}`,
    issuedAt: (receiptInvoice?.createdAt ?? visit.updatedAt ?? new Date()).toISOString(),
    patientName: patientDisplayName(patient),
    patientUhid: patient.uhid,
    patientPhone: patient.phone,
    patientCity: reg.city,
    patientDistrict: reg.district,
    patientAddress,
    patientAge: age > 0 ? age : undefined,
    patientGender,
    patientType,
    appointmentCenter: reg.appointmentCentre || branch?.name || undefined,
    doctorName: visit.doctorName || "Consultant",
    token: visit.token ?? undefined,
    billingStatus: visit.billing ?? "pending",
    paymentScope: receiptInvoice?.paymentScope ?? undefined,
    paymentMode: normalizedPaymentMode,
    paymentBreakdown,
    amountPaid: aggregateAmountPaid,
    balanceDue: aggregateBalanceDue,
    refundAmount: Number((targetSession?.serviceInvoice ?? receiptInvoice)?.refundAmount ?? 0),
    advanceUsed: Number(
      ((targetSession?.serviceInvoice ?? receiptInvoice)?.payload as Record<string, unknown> | null)?.advanceUsed ?? 0,
    ),
    advanceAvailable: Number(
      ((targetSession?.serviceInvoice ?? receiptInvoice)?.payload as Record<string, unknown> | null)?.advanceAvailable ?? 0,
    ),
    paymentStatus:
      String(
        ((targetSession?.serviceInvoice ?? receiptInvoice)?.payload as Record<string, unknown> | null)?.paymentStatus ??
          "",
      ) || undefined,
    settlementType:
      String(
        ((targetSession?.serviceInvoice ?? receiptInvoice)?.payload as Record<string, unknown> | null)?.settlementType ??
          "",
      ) || undefined,
    advancePayments: advancePayments.map((payment) => ({
      receiptNo: payment.referenceNo?.trim() || `ADV-${payment.id.slice(-8).toUpperCase()}`,
      receivedAt: payment.receivedAt.toISOString(),
      amount: Number(payment.amount),
      receivedAmount: Number(payment.receivedAmount),
      mode: payment.mode,
      status: payment.status,
      referenceNo: payment.referenceNo ?? undefined,
    })),
    routingNote: visit.routingNote ?? undefined,
  };

  if (receiptInvoice?.lines.length) {
    const invPayload = (receiptInvoice.payload as Record<string, unknown> | null) ?? {};
    const storedGst =
      invPayload.gst && typeof invPayload.gst === "object" && !Array.isArray(invPayload.gst)
        ? ({ ...branchGst, ...(invPayload.gst as Record<string, unknown>) } as typeof branchGst)
        : branchGst;

    const lines = receiptInvoice.lines.map((line) => {
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
      packageLines: receiptPackageLines,
      subtotal: Number(receiptInvoice.subtotal),
      discount: Number(receiptInvoice.discount ?? 0),
      discountMode:
        invPayload.discountMode === "percent" || invPayload.discountMode === "amount"
          ? invPayload.discountMode
          : undefined,
      discountPercent:
        invPayload.discountPercent != null ? Number(invPayload.discountPercent) : undefined,
      total: receiptTotal,
      cgstTotal: Number(invPayload.cgstTotal ?? 0),
      sgstTotal: Number(invPayload.sgstTotal ?? 0),
      igstTotal: Number(invPayload.igstTotal ?? 0),
      taxTotal: Number(receiptInvoice.taxAmount ?? 0),
    };
  }

  const visitBillAmount = receiptTotal;
  const visitDiscount = Number(receiptInvoice?.discount ?? 0);
  const gstRate = branchGst.gstRatePercent;

  // visit.billAmount is the GST-inclusive grand total, not the taxable amount.
  // Use stored invoice subtotal if available, otherwise reverse-calculate
  // the tax-exclusive amount to avoid double taxation.
  const fallbackTaxable = receiptInvoice?.subtotal
    ? Number(receiptInvoice.subtotal)
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
      packageLines: receiptPackageLines,
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
