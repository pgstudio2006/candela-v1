import type {
  BillingHandoffPayload,
  CounselQuote,
  CounselSession,
  DiscountApproval,
  DiscountPolicy,
} from "@/design-system/counsellor-data";
import { DEFAULT_DISCOUNT_POLICY } from "@/design-system/counsellor-data";
import type { ConsultationRecord, CounsellorQueueItem, TreatmentMode } from "@/design-system/doctor-data";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import { mapPrismaPatientRow } from "@/lib/frontdesk-workflow";
import { validateCompleteCounselSession } from "@/lib/counsellor-validation";
import { prisma } from "@/lib/prisma";
import type { ServerContext } from "@/server/context";
import { requireCounsellorQueueItem, requireCounsellorVisit } from "@/server/counsellor/guards";
import { ServerActionError } from "@/server/errors";
import { resolveCounsellorOperator } from "@/server/module-operator";
import { notifyCounsellorQuoteWhatsapp } from "@/server/notifications";
import { writePlatformAudit } from "@/server/platform-audit";
import { branchScope } from "@/server/tenancy";
import { syncVisitFromOpdVisit } from "@/server/visit-sync";
import { readCounsellorWorkspace, writeCounsellorWorkspace } from "@/server/workspace-state";

type CounsellorPrefs = {
  discountPolicy: DiscountPolicy;
  seniorMode: boolean;
};

function asRecord(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, string | number | boolean>;
}

async function loadCarePackages() {
  // Load from admin packages table first
  const adminPackages = await prisma.package.findMany({
    where: { active: true },
    include: {
      services: {
        include: {
          service: true,
        },
      },
    },
    orderBy: { amount: "asc" },
  });

  if (adminPackages.length > 0) {
    // Transform admin packages to match CARE_PACKAGES structure
    return adminPackages.map((pkg) => ({
      id: pkg.id,
      label: pkg.label,
      amount: Number(pkg.amount),
      sessions: pkg.sessions ?? 6,
      dept: pkg.dept ?? "dept_general",
      // Map services to line items
      lineItems: pkg.services.map((ps) => ({
        id: ps.service.id,
        label: ps.service.label,
        amount: Number(ps.service.rate),
        quantity: ps.quantity,
      })),
    }));
  }

  return [];
}

async function readPrefs(ctx: ServerContext): Promise<CounsellorPrefs> {
  const raw = await readCounsellorWorkspace(ctx, () => ({
    discountPolicy: DEFAULT_DISCOUNT_POLICY,
    seniorMode: false,
  }));
  const payload = raw as Partial<CounsellorPrefs & { sessions?: unknown }>;
  return {
    discountPolicy: payload.discountPolicy ?? DEFAULT_DISCOUNT_POLICY,
    seniorMode: Boolean(payload.seniorMode),
  };
}

async function ensureVisitSynced(ctx: ServerContext, visitId: string) {
  const opd = await requireCounsellorVisit(ctx, visitId);
  await syncVisitFromOpdVisit(ctx, opd);
  return opd;
}

function mapQueueItem(row: {
  id: string;
  visitId: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  sentAt: string;
  treatmentMode: string;
  packageId: string | null;
  packageLabel: string | null;
  priority: string;
  payload: unknown;
}): CounsellorQueueItem {
  return {
    id: row.id,
    visitId: row.visitId,
    patientId: row.patientId,
    doctorId: row.doctorId,
    doctorName: row.doctorName,
    sentAt: String(row.sentAt),
    treatmentMode: row.treatmentMode as TreatmentMode,
    packageId: row.packageId ?? undefined,
    packageLabel: row.packageLabel ?? undefined,
    priority: row.priority === "high" ? "high" : "normal",
    payload: row.payload as ConsultationRecord,
  };
}

function mapVisit(row: {
  id: string;
  patientId: string;
  token: number | null;
  stage: string;
  departmentId: string | null;
  doctorId: string | null;
  doctorName: string | null;
  billing: string | null;
  exam: string | null;
  appointment: boolean;
  appointmentTime: string | null;
  waitMin: number;
  checkInAt: string | null;
  billAmount: number | null;
  amountPaid: number | null;
  balanceDue: number | null;
  treatmentPath: string | null;
  ipdAdmissionId: string | null;
  counselPackageLabel: string | null;
  deferredReason: string | null;
  routingNote: string | null;
}): Visit {
  return {
    id: row.id,
    patientId: row.patientId,
    token: row.token ?? undefined,
    stage: row.stage as Visit["stage"],
    departmentId: row.departmentId ?? "dept_general",
    doctorId: row.doctorId ?? "",
    doctorName: row.doctorName ?? "Doctor",
    billing: (row.billing ?? "pending") as Visit["billing"],
    exam: (row.exam ?? "not_started") as Visit["exam"],
    appointment: row.appointment,
    appointmentTime: row.appointmentTime ?? undefined,
    waitMin: row.waitMin ?? 0,
    checkInAt: row.checkInAt ?? undefined,
    billAmount: row.billAmount ?? undefined,
    amountPaid: row.amountPaid ?? undefined,
    balanceDue: row.balanceDue ?? undefined,
    treatmentPath: (row.treatmentPath ?? undefined) as Visit["treatmentPath"],
    ipdAdmissionId: row.ipdAdmissionId ?? undefined,
    counselPackageLabel: row.counselPackageLabel ?? undefined,
    deferredReason: row.deferredReason ?? undefined,
    routingNote: row.routingNote ?? undefined,
  };
}

function mapSession(row: {
  id: string;
  visitId: string;
  patientId: string;
  counsellorId: string;
  counsellorName: string;
  branchId: string;
  startedAt: Date;
  completedAt: Date | null;
  outcome: string | null;
  quote: unknown;
  internalNotes: string | null;
  patientObjections: string[];
  callbackAt: Date | null;
  voiceNote: string | null;
  aiScript: string | null;
  sentToBilling: boolean;
  billingSentAt: Date | null;
}): CounselSession {
  return {
    id: row.id,
    visitId: row.visitId,
    patientId: row.patientId,
    queueItemId: row.id,
    counsellorId: row.counsellorId,
    counsellorName: row.counsellorName,
    branchId: row.branchId,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    outcome: (row.outcome ?? undefined) as CounselSession["outcome"],
    quote: row.quote ? (row.quote as CounselQuote) : undefined,
    internalNotes: row.internalNotes ?? "",
    patientObjections: row.patientObjections ?? [],
    callbackAt: row.callbackAt?.toISOString(),
    voiceNote: row.voiceNote ?? undefined,
    aiScript: row.aiScript ?? undefined,
    sentToBilling: row.sentToBilling,
    billingSentAt: row.billingSentAt?.toISOString(),
  };
}

function mapApproval(row: {
  id: string;
  visitId: string;
  patientId: string | null;
  requestedPercent: unknown;
  reason: string | null;
  status: string;
  requestedAt: Date;
  resolvedAt: Date | null;
  quoteSnapshot: unknown;
}, patientName: string): DiscountApproval {
  return {
    id: row.id,
    visitId: row.visitId,
    patientId: row.patientId ?? "",
    patientName,
    requestedPercent: Number(row.requestedPercent ?? 0),
    reason: row.reason ?? "",
    status: row.status as DiscountApproval["status"],
    requestedAt: row.requestedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString(),
    quoteSnapshot: row.quoteSnapshot as CounselQuote,
  };
}

export type CounsellorSnapshot = {
  patients: Patient[];
  visits: Visit[];
  queue: CounsellorQueueItem[];
  sessions: CounselSession[];
  approvals: DiscountApproval[];
  approvedDiscounts: DiscountApproval[];
  billingHandoffs: BillingHandoffPayload[];
  packages: Array<{ id: string; label: string; amount: number; sessions: number; dept: string; lineItems?: Array<{ id: string; label: string; amount: number; quantity: number }> }>;
  discountPolicy: DiscountPolicy;
  seniorMode: boolean;
  activeCounsellorId: string;
  activeCounsellorName: string;
  branchId: string;
};

export async function getCounsellorSnapshot(ctx: ServerContext): Promise<CounsellorSnapshot> {
  const { operatorId, operatorName } = await resolveCounsellorOperator();
  const scope = branchScope(ctx);
  const prefs = await readPrefs(ctx);

  const branchVisitIds = new Set(
    (await prisma.opdVisit.findMany({ where: scope, select: { id: true } })).map((v) => v.id),
  );

  const [patientRows, visitRows, queueRows, sessionRows, approvalRows, approvedRows, handoffRows, packages] =
    await Promise.all([
      prisma.patient.findMany({ where: { branchId: ctx.branchId }, orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.opdVisit.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.counsellorQueueItem.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 200 }),
      prisma.counsellorSession.findMany({
        where: { branchId: ctx.branchId },
        orderBy: { startedAt: "desc" },
        take: 200,
      }),
      prisma.approval.findMany({
        where: { branchId: ctx.branchId, approvalType: "discount", status: "pending" },
        orderBy: { requestedAt: "desc" },
        take: 50,
      }),
      prisma.approval.findMany({
        where: {
          branchId: ctx.branchId,
          approvalType: "discount",
          status: "approved",
          visitId: { in: [...branchVisitIds] },
        },
        orderBy: { resolvedAt: "desc" },
        take: 100,
      }),
      prisma.billingHandoff.findMany({ where: { branchId: ctx.branchId }, orderBy: { sentAt: "desc" }, take: 300 }),
      loadCarePackages(),
    ]);

  const patients = patientRows.map((row) =>
    mapPrismaPatientRow({ ...row, department: row.departmentLabel ?? row.department }),
  );
  const patientNameById = new Map(patients.map((p) => [p.id, p.name]));

  return {
    patients,
    visits: visitRows.map(mapVisit),
    queue: queueRows.filter((r) => branchVisitIds.has(r.visitId)).map(mapQueueItem),
    sessions: sessionRows.filter((s) => branchVisitIds.has(s.visitId)).map(mapSession),
    approvals: approvalRows
      .filter((a) => branchVisitIds.has(a.visitId))
      .map((a) => mapApproval(a, patientNameById.get(a.patientId ?? "") ?? a.patientId ?? "Patient")),
    approvedDiscounts: approvedRows
      .filter((a) => branchVisitIds.has(a.visitId))
      .map((a) => mapApproval(a, patientNameById.get(a.patientId ?? "") ?? a.patientId ?? "Patient")),
    billingHandoffs: handoffRows
      .filter((h) => branchVisitIds.has(h.visitId))
      .map((row) => ({
        visitId: row.visitId,
        patientId: row.patientId,
        patientName: row.patientName ?? "Patient",
        uhid: row.uhid ?? "",
        quote: row.quote as BillingHandoffPayload["quote"],
        counsellorName: row.counsellorName,
        counselNotes: row.counselNotes ?? "",
        doctorName: row.doctorName ?? "",
        doctorId: row.doctorId ?? "",
        sentAt: row.sentAt.toISOString(),
        paymentExpectation: (row.paymentExpectation ?? "desk") as BillingHandoffPayload["paymentExpectation"],
        treatmentMode: (row.treatmentMode ?? undefined) as BillingHandoffPayload["treatmentMode"],
        admissionRecommended: row.admissionRecommended ?? undefined,
        diagnosisSummary: row.diagnosisSummary ?? undefined,
      })),
    packages,
    discountPolicy: prefs.discountPolicy,
    seniorMode: prefs.seniorMode,
    activeCounsellorId: operatorId,
    activeCounsellorName: operatorName,
    branchId: ctx.branchId,
  };
}

export async function saveCounsellorPrefs(
  ctx: ServerContext,
  prefs: Partial<Pick<CounsellorPrefs, "seniorMode" | "discountPolicy">>,
) {
  await resolveCounsellorOperator();
  const current = await readPrefs(ctx);
  await writeCounsellorWorkspace(ctx, {
    discountPolicy: prefs.discountPolicy ?? current.discountPolicy,
    seniorMode: prefs.seniorMode ?? current.seniorMode,
  });
}

export async function claimCounselSession(ctx: ServerContext, visitId: string): Promise<CounselSession> {
  const { operatorId, operatorName } = await resolveCounsellorOperator();
  const queueItem = await requireCounsellorQueueItem(ctx, visitId);
  const opd = await ensureVisitSynced(ctx, visitId);

  const active = await prisma.counsellorSession.findFirst({
    where: { visitId, branchId: ctx.branchId, completedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (active) {
    if (active.counsellorId !== operatorId) {
      const ageMs = Date.now() - active.startedAt.getTime();
      if (ageMs < 4 * 60 * 60 * 1000) {
        throw new ServerActionError(
          "FORBIDDEN",
          `Session claimed by ${active.counsellorName}. Try again later or ask them to release.`,
        );
      }
    } else {
      return mapSession(active);
    }
  }

  const created = await prisma.counsellorSession.create({
    data: {
      id: `cs_${visitId}_${Date.now()}`,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      visitId,
      patientId: opd.patientId,
      counsellorId: operatorId,
      counsellorName: operatorName,
      startedAt: new Date(),
      patientObjections: [],
      sentToBilling: false,
    },
  });

  await writePlatformAudit({
    ctx,
    module: "counsellor",
    action: "session_claimed",
    entityType: "visit",
    entityId: visitId,
    summary: `Counsel session started for visit ${visitId} by ${operatorName}`,
    payload: { queueItemId: queueItem.id },
  });

  return mapSession(created);
}

async function hasApprovedDiscount(ctx: ServerContext, visitId: string, requestedPercent: number) {
  const approved = await prisma.approval.findFirst({
    where: {
      branchId: ctx.branchId,
      visitId,
      approvalType: "discount",
      status: "approved",
    },
    orderBy: { resolvedAt: "desc" },
  });
  if (!approved) return false;
  return Number(approved.requestedPercent ?? 0) >= requestedPercent;
}

export async function requestDiscountApproval(
  ctx: ServerContext,
  visitId: string,
  quote: CounselQuote,
  reason: string,
) {
  const { operatorName } = await resolveCounsellorOperator();
  await requireCounsellorQueueItem(ctx, visitId);
  await ensureVisitSynced(ctx, visitId);

  const id = `appr_${visitId}_${Date.now()}`;
  await prisma.approval.create({
    data: {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      visitId,
      patientId: quote.patientId,
      approvalType: "discount",
      requestedPercent: quote.discountPercent,
      reason,
      status: "pending",
      requestedAt: new Date(),
      quoteSnapshot: quote,
    },
  });

  await writePlatformAudit({
    ctx,
    module: "counsellor",
    action: "discount_approval_requested",
    entityType: "visit",
    entityId: visitId,
    summary: `${operatorName} requested ${quote.discountPercent}% discount approval`,
    severity: "warning",
  });

  return id;
}

export async function resolveDiscountApproval(
  ctx: ServerContext,
  approvalId: string,
  approved: boolean,
) {
  const { operatorName } = await resolveCounsellorOperator();
  const row = await prisma.approval.findFirst({
    where: { id: approvalId, branchId: ctx.branchId, approvalType: "discount" },
  });
  if (!row) throw new ServerActionError("NOT_FOUND", "Approval not found.");

  await prisma.approval.update({
    where: { id: approvalId },
    data: { status: approved ? "approved" : "rejected", resolvedAt: new Date() },
  });

  await writePlatformAudit({
    ctx,
    module: "counsellor",
    action: approved ? "discount_approved" : "discount_rejected",
    entityType: "approval",
    entityId: approvalId,
    summary: `${operatorName} ${approved ? "approved" : "rejected"} discount for visit ${row.visitId}`,
    severity: approved ? "info" : "warning",
  });
}

export async function completeCounselSession(
  ctx: ServerContext,
  visitId: string,
  opts: {
    outcome: CounselSession["outcome"];
    quote?: CounselQuote;
    internalNotes: string;
    objections: string[];
    callbackAt?: string;
    sendToBilling: boolean;
    paymentExpectation: BillingHandoffPayload["paymentExpectation"];
    consentCaptured?: boolean;
    whatsappSent?: boolean;
    voiceNote?: string;
    aiScript?: string;
  },
) {
  const { operatorId, operatorName } = await resolveCounsellorOperator();
  const prefs = await readPrefs(ctx);
  const maxDiscount = prefs.seniorMode
    ? prefs.discountPolicy.seniorMaxPercent
    : prefs.discountPolicy.counsellorMaxPercent;

  const approvedDiscount = opts.quote
    ? await hasApprovedDiscount(ctx, visitId, opts.quote.discountPercent)
    : false;

  const validated = validateCompleteCounselSession(
    {
      outcome: opts.outcome!,
      internalNotes: opts.internalNotes,
      objections: opts.objections,
      callbackAt: opts.callbackAt,
      sendToBilling: opts.sendToBilling,
      paymentExpectation: opts.paymentExpectation,
      consentCaptured: opts.consentCaptured ?? false,
      whatsappSent: opts.whatsappSent ?? false,
      voiceNote: opts.voiceNote,
      aiScript: opts.aiScript,
      quote: opts.quote,
    },
    prefs.discountPolicy,
    maxDiscount,
    approvedDiscount,
  );

  const queueItem = await requireCounsellorQueueItem(ctx, visitId);
  const opd = await ensureVisitSynced(ctx, visitId);
  const patient = await prisma.patient.findUnique({ where: { id: opd.patientId } });
  if (!patient) throw new ServerActionError("NOT_FOUND", "Patient not found.");

  const now = new Date();
  const session = await prisma.counsellorSession.findFirst({
    where: { visitId, branchId: ctx.branchId, completedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (session && session.counsellorId !== operatorId) {
    throw new ServerActionError("FORBIDDEN", "Another counsellor owns this active session.");
  }

  const sendBilling = validated.sendToBilling && validated.outcome === "converted" && validated.quote;
  let nextStage: Visit["stage"] = "completed";
  if (sendBilling) nextStage = "billing";
  else if (validated.outcome === "callback") nextStage = "awaiting_counsellor";

  await prisma.$transaction(async (tx) => {
    if (session) {
      await tx.counsellorSession.update({
        where: { id: session.id },
        data: {
          completedAt: now,
          outcome: validated.outcome,
          quote: validated.quote ?? undefined,
          internalNotes: validated.internalNotes,
          patientObjections: validated.objections,
          callbackAt: validated.callbackAt ? new Date(validated.callbackAt) : null,
          voiceNote: validated.voiceNote,
          aiScript: validated.aiScript,
          sentToBilling: Boolean(sendBilling),
          billingSentAt: sendBilling ? now : null,
        },
      });
    } else {
      await tx.counsellorSession.create({
        data: {
          id: `cs_${visitId}_${Date.now()}`,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          visitId,
          patientId: opd.patientId,
          counsellorId: operatorId,
          counsellorName: operatorName,
          startedAt: now,
          completedAt: now,
          outcome: validated.outcome,
          quote: validated.quote ?? undefined,
          internalNotes: validated.internalNotes,
          patientObjections: validated.objections,
          callbackAt: validated.callbackAt ? new Date(validated.callbackAt) : null,
          voiceNote: validated.voiceNote,
          aiScript: validated.aiScript,
          sentToBilling: Boolean(sendBilling),
          billingSentAt: sendBilling ? now : null,
        },
      });
    }

    if (sendBilling && validated.quote) {
      const payload = (queueItem.payload ?? {}) as Partial<ConsultationRecord>;
      const handoffPayload: BillingHandoffPayload = {
        visitId,
        patientId: patient.id,
        patientName: patient.fullName ?? patient.name,
        uhid: patient.uhid,
        quote: {
          ...validated.quote,
          consentCaptured: validated.consentCaptured,
          whatsappSent: validated.whatsappSent,
        },
        counsellorName: operatorName,
        counselNotes: validated.internalNotes,
        doctorName: queueItem.doctorName,
        doctorId: queueItem.doctorId,
        sentAt: now.toISOString(),
        paymentExpectation: validated.paymentExpectation,
        treatmentMode: queueItem.treatmentMode as BillingHandoffPayload["treatmentMode"],
        admissionRecommended:
          queueItem.treatmentMode === "ipd" ||
          payload.treatmentMode === "ipd" ||
          payload.treatmentMode === "daycare" ||
          Boolean(validated.quote.lineItems.some((l) => l.id === "addon_ipd_day")),
        diagnosisSummary: String(
          payload.diagnosis?.primaryDiagnosis ?? payload.diagnosis?.clinicalImpression ?? "",
        ),
      };

      await tx.billingHandoff.upsert({
        where: { id: `bh_${visitId}` },
        create: {
          id: `bh_${visitId}`,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          visitId,
          patientId: patient.id,
          patientName: handoffPayload.patientName,
          uhid: patient.uhid,
          packageId: validated.quote.packageId,
          quote: handoffPayload.quote,
          counsellorName: operatorName,
          counselNotes: validated.internalNotes,
          doctorName: queueItem.doctorName,
          doctorId: queueItem.doctorId,
          paymentExpectation: validated.paymentExpectation,
          treatmentMode: handoffPayload.treatmentMode,
          admissionRecommended: handoffPayload.admissionRecommended,
          diagnosisSummary: handoffPayload.diagnosisSummary,
          sentAt: now,
        },
        update: {
          patientName: handoffPayload.patientName,
          uhid: patient.uhid,
          packageId: validated.quote.packageId,
          quote: handoffPayload.quote,
          counsellorName: operatorName,
          counselNotes: validated.internalNotes,
          doctorName: queueItem.doctorName,
          doctorId: queueItem.doctorId,
          paymentExpectation: validated.paymentExpectation,
          treatmentMode: handoffPayload.treatmentMode,
          admissionRecommended: handoffPayload.admissionRecommended,
          diagnosisSummary: handoffPayload.diagnosisSummary,
          sentAt: now,
        },
      });

      await tx.opdVisit.update({
        where: { id: visitId },
        data: {
          stage: "billing",
          billAmount: validated.quote.netAmount,
          billing: "pending",
          counselPackageLabel: validated.quote.packageLabel,
        },
      });
    } else if (validated.outcome !== "callback") {
      await tx.opdVisit.update({
        where: { id: visitId },
        data: { stage: nextStage },
      });
    }

    if (validated.outcome !== "callback") {
      await tx.counsellorQueueItem.deleteMany({ where: { visitId } });
    } else {
      await tx.counsellorQueueItem.update({
        where: { visitId },
        data: { priority: "high", sentAt: now.toISOString() },
      });
    }
  });

  const updatedOpd = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (updatedOpd) await syncVisitFromOpdVisit(ctx, updatedOpd);

  if (sendBilling && validated.quote && validated.whatsappSent && patient.phone) {
    await notifyCounsellorQuoteWhatsapp(ctx, {
      patientName: patient.fullName ?? patient.name,
      phone: patient.phone,
      visitId,
      netAmount: validated.quote.netAmount,
      packageLabel: validated.quote.packageLabel,
    });
  }

  await writePlatformAudit({
    ctx,
    module: "counsellor",
    action: sendBilling ? "session_converted_billing" : `session_${validated.outcome}`,
    entityType: "visit",
    entityId: visitId,
    summary: sendBilling
      ? `Converted & sent to billing — ₹${validated.quote!.netAmount.toLocaleString("en-IN")}`
      : `Counsel outcome: ${validated.outcome}`,
    severity: validated.outcome === "lost" ? "warning" : "info",
    payload: { outcome: validated.outcome, paymentExpectation: validated.paymentExpectation },
  });
}

export async function listCounsellorAuditLogs(
  ctx: ServerContext,
  input: { limit?: number; cursor?: string },
) {
  const limit = Math.min(100, Math.max(10, input.limit ?? 50));
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      module: "counsellor",
      ...(input.cursor ? { createdAt: { lt: new Date(input.cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    actor: r.actor,
    actorRole: r.actorRole ?? "",
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    summary: r.summary,
    severity: r.severity,
  }));
}

/** Legacy login for workspace picker */
export async function validateCounsellorLogin(email: string, password: string) {
  const { verifyPassword } = await import("@/server/revenue/password");
  const normalized = email.trim().toLowerCase();
  const cred = await prisma.counsellorOperatorCredential.findUnique({ where: { email: normalized } });
  if (!cred || !cred.active) {
    return { ok: false as const, error: "No counsellor account for this email." };
  }
  if (!(await verifyPassword(password, cred.passwordHash))) {
    return { ok: false as const, error: "Incorrect password." };
  }
  return { ok: true as const, operatorId: cred.id, name: cred.name, email: cred.email };
}
