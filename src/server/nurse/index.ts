import type {
  ConsentRecord,
  DischargeSummary,
  NurseTask,
  NursingEpisode,
  NursingHandoffPayload,
  TreatmentSession,
  VitalsRecord,
} from "@/design-system/nurse-data";
import {
  requiredConsentsComplete,
  sessionCountForPackage,
  templatesForHandoff,
} from "@/design-system/nurse-data";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import {
  validateCompleteEpisode,
  validateSaveVitals,
  validateSignConsent,
  validateStartSession,
  validateUploadConsent,
} from "@/lib/nurse-validation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClinicalSnapshot, saveSubmission } from "@/server/clinical";
import { writeIpdRoundLog } from "@/server/ipd";
import { createNursePharmacyOrder as createNursePharmacyOrderInPharmacy } from "@/server/pharmacy";
import type { ServerContext } from "@/server/context";
import { ServerActionError } from "@/server/errors";
import { resolveNurseOperator } from "@/server/module-operator";
import {
  assertNurseOwnsEpisode,
  requireNurseEpisode,
  requireNurseHandoff,
  requireNurseVisit,
} from "@/server/nurse/guards";
import { writePlatformAudit } from "@/server/platform-audit";
import { syncVisitFromOpdVisit } from "@/server/visit-sync";

const NURSING_STAGES = ["nursing_queue", "nursing_active", "ipd_admitted"] as const;

function asNursingHandoff(value: {
  visitId: string;
  patientId: string;
  patientName: string;
  uhid: string;
  doctorId: string;
  doctorName: string;
  treatmentPath: string;
  packageId: string;
  packageLabel: string;
  billingStatus: string;
  amountPaid: number;
  balanceDue: number | null;
  netAmount: number;
  commercialConsent: boolean;
  billingHandoff: unknown;
  consultation: unknown;
  ipdWard: string | null;
  ipdBed: string | null;
  sentAt: string;
}): NursingHandoffPayload {
  return {
    visitId: value.visitId,
    patientId: value.patientId,
    patientName: value.patientName,
    uhid: value.uhid,
    doctorId: value.doctorId,
    doctorName: value.doctorName,
    treatmentPath: value.treatmentPath as NursingHandoffPayload["treatmentPath"],
    packageId: value.packageId,
    packageLabel: value.packageLabel,
    billingStatus: value.billingStatus,
    amountPaid: value.amountPaid,
    balanceDue: value.balanceDue ?? undefined,
    netAmount: value.netAmount,
    commercialConsent: value.commercialConsent,
    billingHandoff: value.billingHandoff
      ? (value.billingHandoff as NursingHandoffPayload["billingHandoff"])
      : undefined,
    consultation: value.consultation
      ? (value.consultation as NursingHandoffPayload["consultation"])
      : undefined,
    ipdWard: value.ipdWard ?? undefined,
    ipdBed: value.ipdBed ?? undefined,
    sentAt: value.sentAt,
  };
}

function asEpisode(row: {
  id: string;
  visitId: string;
  patientId: string;
  nurseId: string;
  nurseName: string;
  branchId: string;
  treatmentPath: string;
  packageLabel: string;
  packageId: string;
  doctorName: string;
  doctorId: string;
  billingStatus: string;
  balanceDue: number | null;
  status: string;
  priority: string;
  queuedAt: string;
  vitals: unknown;
  consents: unknown;
  sessions: unknown;
  internalNotes: string;
  tasks: unknown;
  dischargeSummary: unknown;
  completedAt: string | null;
}): NursingEpisode {
  return {
    id: row.id,
    visitId: row.visitId,
    patientId: row.patientId,
    nurseId: row.nurseId,
    nurseName: row.nurseName,
    branchId: row.branchId,
    treatmentPath: row.treatmentPath as NursingEpisode["treatmentPath"],
    packageLabel: row.packageLabel,
    packageId: row.packageId,
    doctorName: row.doctorName,
    doctorId: row.doctorId,
    billingStatus: row.billingStatus,
    balanceDue: row.balanceDue ?? undefined,
    status: row.status as NursingEpisode["status"],
    priority: row.priority as NursingEpisode["priority"],
    queuedAt: row.queuedAt,
    vitals: row.vitals ? (row.vitals as VitalsRecord) : undefined,
    consents: (Array.isArray(row.consents) ? row.consents : []) as ConsentRecord[],
    sessions: (Array.isArray(row.sessions) ? row.sessions : []) as TreatmentSession[],
    internalNotes: row.internalNotes,
    tasks: (Array.isArray(row.tasks) ? row.tasks : []) as NurseTask[],
    dischargeSummary: row.dischargeSummary ? (row.dischargeSummary as DischargeSummary) : undefined,
    completedAt: row.completedAt ?? undefined,
  };
}

function buildConsents(handoff: NursingHandoffPayload): ConsentRecord[] {
  return templatesForHandoff(handoff).map((t) => ({
    id: `cr_${handoff.visitId}_${t.id}`,
    templateId: t.id,
    templateVersion: t.version,
    visitId: handoff.visitId,
    patientId: handoff.patientId,
    label: t.label,
    status: "draft",
    required: t.required,
    language: t.language,
  }));
}

function buildInitialSessions(handoff: NursingHandoffPayload): TreatmentSession[] {
  const total = sessionCountForPackage(handoff.packageId);
  return [
    {
      id: `ts_${handoff.visitId}_1`,
      visitId: handoff.visitId,
      sessionNumber: 1,
      totalSessions: total,
      procedure: handoff.packageLabel,
      status: "scheduled",
    },
  ];
}

function computePriority(handoff: NursingHandoffPayload, vitals?: VitalsRecord): "normal" | "high" {
  if (handoff.treatmentPath === "ipd") return "high";
  if (vitals?.redFlags?.trim()) return "high";
  return "normal";
}

async function ensureVisitSynced(ctx: ServerContext, visitId: string) {
  const opd = await requireNurseVisit(ctx, visitId);
  await syncVisitFromOpdVisit(ctx, opd);
  return opd;
}

async function syncVisitAfterUpdate(ctx: ServerContext, visitId: string) {
  const updatedOpd = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (updatedOpd) await syncVisitFromOpdVisit(ctx, updatedOpd);
}

export type NurseSnapshot = {
  patients: Patient[];
  visits: Visit[];
  handoffs: NursingHandoffPayload[];
  episodes: NursingEpisode[];
  activeNurseId: string;
  activeNurseName: string;
  branchId: string;
};

export async function getNurseSnapshot(ctx: ServerContext): Promise<NurseSnapshot> {
  const { operatorId, operatorName, ward } = await resolveNurseOperator(ctx);
  const clinical = await getClinicalSnapshot(ctx);
  const branchVisitIds = new Set(clinical.visits.map((v) => v.id));
  const nursingVisits = clinical.visits.filter((v) =>
    NURSING_STAGES.includes(v.stage as (typeof NURSING_STAGES)[number]),
  );
  const nursingVisitIds = nursingVisits.map((v) => v.id);

  const handoffWhere: Prisma.NursingHandoffWhereInput = { visitId: { in: nursingVisitIds } };
  if (ward) {
    handoffWhere.OR = [
      { treatmentPath: { not: "ipd" } },
      { treatmentPath: "ipd", ipdWard: ward },
    ];
  }

  const [handoffRows, episodeRows] = await Promise.all([
    prisma.nursingHandoff.findMany({
      where: handoffWhere,
      orderBy: { createdAt: "asc" },
    }),
    prisma.nursingEpisode.findMany({
      where: { branchId: ctx.branchId, visitId: { in: [...branchVisitIds] } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    patients: clinical.patients,
    visits: clinical.visits,
    handoffs: handoffRows.map(asNursingHandoff),
    episodes: episodeRows.map(asEpisode),
    activeNurseId: operatorId,
    activeNurseName: operatorName,
    branchId: ctx.branchId,
  };
}

export async function claimEpisode(ctx: ServerContext, visitId: string): Promise<NursingEpisode> {
  const { operatorId, operatorName } = await resolveNurseOperator(ctx);
  const handoffRow = await requireNurseHandoff(ctx, visitId);
  await ensureVisitSynced(ctx, visitId);
  const handoff = asNursingHandoff(handoffRow);

  const existing = await prisma.nursingEpisode.findUnique({ where: { visitId } });
  if (existing) {
    if (existing.status === "completed") {
      throw new ServerActionError("VALIDATION", "This nursing episode is already completed.");
    }
    if (existing.nurseId !== operatorId && existing.nurseId !== ctx.userId) {
      throw new ServerActionError(
        "FORBIDDEN",
        `Episode claimed by ${existing.nurseName}. Ask them to release or contact a supervisor.`,
      );
    }
    return asEpisode(existing);
  }

  const created = await prisma.nursingEpisode.create({
    data: {
      id: `ep_${visitId}`,
      visitId,
      patientId: handoff.patientId,
      nurseId: operatorId,
      nurseName: operatorName,
      branchId: ctx.branchId,
      treatmentPath: handoff.treatmentPath,
      packageLabel: handoff.packageLabel,
      packageId: handoff.packageId,
      doctorName: handoff.doctorName,
      doctorId: handoff.doctorId,
      billingStatus: handoff.billingStatus,
      balanceDue: handoff.balanceDue ?? null,
      status: "queued",
      priority: computePriority(handoff),
      queuedAt: handoff.sentAt,
      consents: buildConsents(handoff),
      sessions: buildInitialSessions(handoff),
      internalNotes: "",
      tasks: [],
      dischargeSummary: undefined,
    },
  });

  await writePlatformAudit({
    ctx,
    module: "nurse",
    action: "episode_claimed",
    entityType: "visit",
    entityId: visitId,
    summary: `Nursing episode claimed for ${handoff.patientName} by ${operatorName}`,
    payload: { packageLabel: handoff.packageLabel, treatmentPath: handoff.treatmentPath },
  });

  return asEpisode(created);
}

export async function saveVitals(
  ctx: ServerContext,
  visitId: string,
  vitals: Omit<VitalsRecord, "visitId" | "recordedAt" | "recordedBy">,
) {
  const { operatorId, operatorName } = await resolveNurseOperator(ctx);
  await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  const validated = validateSaveVitals(vitals);

  const record: VitalsRecord = {
    ...validated,
    visitId,
    recordedAt: new Date().toISOString(),
    recordedBy: operatorName,
  };

  const priority = validated.redFlags.trim() ? "high" : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.nursingEpisode.update({
      where: { visitId },
      data: {
        vitals: record,
        status: "consent",
        ...(priority ? { priority } : {}),
      },
    });
    await tx.opdVisit.updateMany({
      where: { id: visitId, stage: "nursing_queue" },
      data: {
        stage: "nursing_active",
        routingNote: validated.redFlags.trim()
          ? `Nursing active · red flags noted: ${validated.redFlags.slice(0, 80)}`
          : "Nursing intake · vitals captured",
      },
    });
  });

  await syncVisitAfterUpdate(ctx, visitId);

  await writePlatformAudit({
    ctx,
    module: "nurse",
    action: "vitals_recorded",
    entityType: "visit",
    entityId: visitId,
    summary: `Vitals recorded by ${operatorName}`,
    severity: validated.redFlags.trim() ? "warning" : "info",
    payload: {
      bp: `${record.bpSystolic}/${record.bpDiastolic}`,
      pulse: record.pulse,
      spo2: record.spo2,
      redFlags: record.redFlags || undefined,
    },
  });

  const ipdAdmission = await prisma.ipdAdmission.findUnique({ where: { visitId } });
  if (ipdAdmission) {
    await writeIpdRoundLog(ctx, {
      ipdAdmissionId: ipdAdmission.id,
      visitId,
      kind: "nurse_vitals",
      actorId: operatorId,
      actorName: operatorName,
      actorRole: "nurse",
      content: `Vitals · BP ${record.bpSystolic}/${record.bpDiastolic} · Pulse ${record.pulse} · SpO₂ ${record.spo2}% · Temp ${record.temperature}°C · Pain ${record.painScore}/10${record.redFlags.trim() ? ` · Red flags: ${record.redFlags}` : ""}`,
      data: record as unknown as Record<string, string | number | boolean>,
    });
  }
}

export async function saveNurseIpdNote(ctx: ServerContext, visitId: string, content: string) {
  const { operatorId, operatorName } = await resolveNurseOperator(ctx);
  await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  await logIpdNurseNote(ctx, visitId, operatorId, operatorName, content);
}

async function logIpdNurseNote(
  ctx: ServerContext,
  visitId: string,
  operatorId: string,
  operatorName: string,
  content: string,
  data?: Record<string, string | number | boolean>,
) {
  const ipdAdmission = await prisma.ipdAdmission.findUnique({ where: { visitId } });
  if (!ipdAdmission) return;
  await writeIpdRoundLog(ctx, {
    ipdAdmissionId: ipdAdmission.id,
    visitId,
    kind: "nurse_note",
    actorId: operatorId,
    actorName: operatorName,
    actorRole: "nurse",
    content,
    data: data ?? { note: content },
  });
}

async function patchConsent(
  ctx: ServerContext,
  visitId: string,
  consentId: string,
  patch: Partial<ConsentRecord>,
  audit: { action: string; summary: string; severity?: "info" | "warning" | "critical" },
) {
  const { operatorId } = await resolveNurseOperator(ctx);
  const episode = await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  const consents = (Array.isArray(episode.consents) ? episode.consents : []) as ConsentRecord[];
  const consent = consents.find((c) => c.id === consentId);
  if (!consent) {
    throw new ServerActionError("NOT_FOUND", "Consent record not found.");
  }

  const next = consents.map((c) => (c.id === consentId ? { ...c, ...patch } : c));
  const allVerified = requiredConsentsComplete(next);

  await prisma.nursingEpisode.update({
    where: { visitId },
    data: {
      consents: next,
      status: allVerified ? "ready" : episode.status === "queued" ? "consent" : episode.status,
    },
  });

  await writePlatformAudit({
    ctx,
    module: "nurse",
    action: audit.action,
    entityType: "consent",
    entityId: consentId,
    summary: audit.summary,
    severity: audit.severity,
    payload: { visitId, label: consent.label },
  });
}

export async function presentConsent(ctx: ServerContext, visitId: string, consentId: string) {
  const { operatorName } = await resolveNurseOperator(ctx);
  await patchConsent(ctx, visitId, consentId, { status: "presented" }, {
    action: "consent_presented",
    summary: `Consent presented by ${operatorName}`,
  });
}

export async function signConsent(
  ctx: ServerContext,
  visitId: string,
  consentId: string,
  data: {
    signatureDataUrl: string;
    signerName: string;
    signerRole?: ConsentRecord["signerRole"];
    witnessName?: string;
  },
) {
  const { operatorId, operatorName } = await resolveNurseOperator(ctx);
  const episode = await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  const validated = validateSignConsent(data, episode.treatmentPath);

  await patchConsent(
    ctx,
    visitId,
    consentId,
    {
      status: "signed",
      captureMode: "canvas",
      signatureDataUrl: validated.signatureDataUrl,
      signerName: validated.signerName,
      signerRole: validated.signerRole ?? "patient",
      witnessName: validated.witnessName,
      signedAt: new Date().toISOString(),
    },
    {
      action: "consent_signed",
      summary: `Consent signed by ${validated.signerName} (verified by ${operatorName})`,
    },
  );
}

export async function uploadConsent(
  ctx: ServerContext,
  visitId: string,
  consentId: string,
  data: { uploadDataUrl: string; uploadFileName: string; signerName: string },
) {
  const { operatorName } = await resolveNurseOperator(ctx);
  const validated = validateUploadConsent(data);

  await patchConsent(
    ctx,
    visitId,
    consentId,
    {
      status: "uploaded",
      captureMode: "upload",
      uploadDataUrl: validated.uploadDataUrl,
      uploadFileName: validated.uploadFileName,
      signerName: validated.signerName,
      signedAt: new Date().toISOString(),
    },
    {
      action: "consent_uploaded",
      summary: `Consent scan uploaded for ${validated.signerName} by ${operatorName}`,
    },
  );
}

export async function verifyConsent(ctx: ServerContext, visitId: string, consentId: string) {
  const { operatorId, operatorName } = await resolveNurseOperator(ctx);
  const episode = await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  const consents = ((Array.isArray(episode.consents) ? episode.consents : []) as ConsentRecord[]).map(
    (c) =>
      c.id === consentId
        ? {
            ...c,
            status: "verified" as const,
            verifiedAt: new Date().toISOString(),
            verifiedBy: operatorName,
          }
        : c,
  );

  const allVerified = requiredConsentsComplete(consents);

  await prisma.nursingEpisode.update({
    where: { visitId },
    data: {
      consents,
      status: allVerified ? "ready" : episode.status,
    },
  });

  await writePlatformAudit({
    ctx,
    module: "nurse",
    action: "consent_verified",
    entityType: "consent",
    entityId: consentId,
    summary: `Consent verified by ${operatorName}`,
    payload: { visitId, allRequiredComplete: allVerified },
  });
}

export async function declineConsent(ctx: ServerContext, visitId: string, consentId: string, reason: string) {
  const { operatorName } = await resolveNurseOperator(ctx);
  if (!reason.trim()) {
    throw new ServerActionError("VALIDATION", "Decline reason is required.");
  }
  await patchConsent(
    ctx,
    visitId,
    consentId,
    { status: "declined", declinedReason: reason.trim() },
    {
      action: "consent_declined",
      summary: `Consent declined by ${operatorName}`,
      severity: "warning",
    },
  );
}

export async function startSession(ctx: ServerContext, visitId: string, bay: string, notes?: string) {
  const { operatorId, operatorName } = await resolveNurseOperator(ctx);
  const episodeRow = await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  const episode = asEpisode(episodeRow);
  const { session } = validateStartSession(episode, episode.consents, bay);

  const sessions = episode.sessions.map((s) =>
    s.id === session.id
      ? { ...s, status: "in_progress" as const, bay, startedAt: new Date().toISOString(), notes: notes ?? s.notes }
      : s,
  );

  await prisma.nursingEpisode.update({
    where: { visitId },
    data: { sessions, status: "in_treatment" },
  });

  await writePlatformAudit({
    ctx,
    module: "nurse",
    action: "session_started",
    entityType: "session",
    entityId: session.id,
    summary: `Session ${session.sessionNumber} started in ${bay} by ${operatorName}`,
    payload: { visitId, bay },
  });
}

function buildNextSession(visitId: string, packageId: string, packageLabel: string, nextNumber: number): TreatmentSession {
  const total = sessionCountForPackage(packageId);
  return {
    id: `ts_${visitId}_${nextNumber}`,
    visitId,
    sessionNumber: nextNumber,
    totalSessions: total,
    procedure: packageLabel,
    status: "scheduled",
  };
}

export async function completeSession(
  ctx: ServerContext,
  visitId: string,
  sessionId: string,
  values?: Record<string, unknown>,
): Promise<{ episodeComplete: boolean; nextSessionNumber?: number }> {
  const { operatorId, operatorName } = await resolveNurseOperator(ctx);
  const episodeRow = await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  const episode = asEpisode(episodeRow);
  const notes =
    typeof values?.sessionNotes === "string"
      ? values.sessionNotes
      : typeof values?.notes === "string"
        ? values.notes
        : undefined;

  const session = episode.sessions.find((s) => s.id === sessionId);
  if (!session) {
    throw new ServerActionError("NOT_FOUND", "Treatment session not found.");
  }
  if (session.status !== "in_progress") {
    throw new ServerActionError("VALIDATION", "Only an in-progress session can be completed.");
  }

  const sessions = episode.sessions.map((s) =>
    s.id === sessionId
      ? { ...s, status: "completed" as const, completedAt: new Date().toISOString(), notes }
      : s,
  );

  const total = sessionCountForPackage(episode.packageId);
  const hasMore = session.sessionNumber < total;

  if (hasMore) {
    const nextSession = buildNextSession(
      visitId,
      episode.packageId,
      episode.packageLabel,
      session.sessionNumber + 1,
    );
    sessions.push(nextSession);

    await prisma.$transaction(async (tx) => {
      await tx.nursingEpisode.update({
        where: { visitId },
        data: { sessions, status: "ready" },
      });
      await tx.opdVisit.update({
        where: { id: visitId },
        data: {
          routingNote: `Session ${session.sessionNumber}/${total} complete · session ${nextSession.sessionNumber} scheduled`,
        },
      });
    });

    await syncVisitAfterUpdate(ctx, visitId);

    await writePlatformAudit({
      ctx,
      module: "nurse",
      action: "session_completed",
      entityType: "session",
      entityId: sessionId,
      summary: `Session ${session.sessionNumber}/${total} completed by ${operatorName} · next session scheduled`,
      payload: { visitId, notes, nextSession: nextSession.sessionNumber },
    });

    if (values && Object.keys(values).length > 0) {
      await saveSubmission(
        ctx,
        "nurse-session-notes",
        values as Record<string, string | number | boolean>,
        { patientId: episode.patientId, visitId },
      );
    }

    if (episode.treatmentPath === "ipd" && notes?.trim()) {
      await logIpdNurseNote(ctx, visitId, operatorId, operatorName, `Session ${session.sessionNumber}/${total} note: ${notes}`, {
        sessionId,
        sessionNumber: session.sessionNumber,
        notes,
      });
    }

    return { episodeComplete: false, nextSessionNumber: nextSession.sessionNumber };
  }

  await prisma.nursingEpisode.update({
    where: { visitId },
    data: { sessions, status: "ready" },
  });

  await writePlatformAudit({
    ctx,
    module: "nurse",
    action: "session_completed",
    entityType: "session",
    entityId: sessionId,
    summary: `Final session ${session.sessionNumber}/${total} completed by ${operatorName}`,
    payload: { visitId, notes },
  });

  if (values && Object.keys(values).length > 0) {
    await saveSubmission(
      ctx,
      "nurse-session-notes",
      values as Record<string, string | number | boolean>,
      { patientId: episode.patientId, visitId },
    );
  }

  if (episode.treatmentPath === "ipd" && notes?.trim()) {
    await logIpdNurseNote(ctx, visitId, operatorId, operatorName, `Final session ${session.sessionNumber}/${total} note: ${notes}`, {
      sessionId,
      sessionNumber: session.sessionNumber,
      notes,
      final: true,
    });
  }

  return { episodeComplete: false };
}

export async function completeEpisode(ctx: ServerContext, visitId: string) {
  const { operatorId, operatorName } = await resolveNurseOperator(ctx);
  const episodeRow = await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  const episode = asEpisode(episodeRow);
  validateCompleteEpisode(episode);

  const completedCount = episode.sessions.filter((s) => s.status === "completed").length;
  const total = sessionCountForPackage(episode.packageId);
  const routingNote =
    completedCount >= total
      ? `All ${total} treatment sessions complete`
      : `Care plan active · ${completedCount}/${total} sessions complete`;

  await prisma.$transaction(async (tx) => {
    await tx.nursingEpisode.update({
      where: { visitId },
      data: { status: "completed", completedAt: new Date().toISOString() },
    });
    await tx.nursingHandoff.deleteMany({ where: { visitId } });
    await tx.opdVisit.update({
      where: { id: visitId },
      data: { stage: "completed", routingNote },
    });
  });

  await syncVisitAfterUpdate(ctx, visitId);

  await writePlatformAudit({
    ctx,
    module: "nurse",
    action: "episode_completed",
    entityType: "visit",
    entityId: visitId,
    summary: `Nursing episode closed by ${operatorName} · ${completedCount}/${total} sessions done`,
    payload: { packageLabel: episode.packageLabel, completedCount, total },
  });
}

export async function updateEpisodeNotes(ctx: ServerContext, visitId: string, notes: string) {
  const { operatorId } = await resolveNurseOperator(ctx);
  await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  await prisma.nursingEpisode.update({
    where: { visitId },
    data: { internalNotes: notes.slice(0, 4000) },
  });
}

export async function createNursePharmacyOrder(
  ctx: ServerContext,
  visitId: string,
  input: {
    patientName: string;
    uhid: string;
    lines: Array<{ drug: string; dose: string; frequency: string; duration: string; instructions?: string }>;
    priority?: "routine" | "urgent" | "stat";
  },
) {
  const { operatorId, operatorName } = await resolveNurseOperator(ctx);
  const episodeRow = await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  const episode = asEpisode(episodeRow);
  if (!input.lines.length) {
    throw new ServerActionError("VALIDATION", "Add at least one medicine line.");
  }
  const rxId = await createNursePharmacyOrderInPharmacy(ctx, {
    visitId,
    patientName: input.patientName,
    uhid: input.uhid,
    nurseName: operatorName,
    lines: input.lines,
    priority: input.priority,
  });
  await writePlatformAudit({
    ctx,
    module: "nurse",
    action: "pharmacy_order_created",
    entityType: "visit",
    entityId: visitId,
    summary: `IPD pharmacy order created by ${operatorName} for ${input.patientName}`,
    payload: { rxId, lineCount: input.lines.length },
  });
  return { rxId, episodeId: episode.id };
}

export async function createNurseTask(
  ctx: ServerContext,
  visitId: string,
  input: { title: string; assignedBy?: string },
): Promise<NurseTask> {
  const { operatorId, operatorName } = await resolveNurseOperator(ctx);
  const episodeRow = await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  const episode = asEpisode(episodeRow);
  const task: NurseTask = {
    id: `nt_${visitId}_${Date.now()}`,
    visitId,
    title: input.title.trim().slice(0, 200),
    status: "pending",
    assignedBy: input.assignedBy?.trim().slice(0, 120) || episode.doctorName || "Doctor",
    assignedAt: new Date().toISOString(),
  };
  const tasks = [...episode.tasks, task];
  await prisma.nursingEpisode.update({
    where: { visitId },
    data: { tasks },
  });
  await writePlatformAudit({
    ctx,
    module: "nurse",
    action: "task_created",
    entityType: "visit",
    entityId: visitId,
    summary: `Task added by ${operatorName}: ${task.title}`,
    payload: { taskId: task.id },
  });
  return task;
}

export async function updateNurseTaskStatus(
  ctx: ServerContext,
  visitId: string,
  taskId: string,
  status: NurseTask["status"],
  notes?: string,
): Promise<NurseTask> {
  const { operatorId, operatorName } = await resolveNurseOperator(ctx);
  const episodeRow = await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  const episode = asEpisode(episodeRow);
  const task = episode.tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new ServerActionError("NOT_FOUND", "Task not found in this episode.");
  }
  const updated: NurseTask = {
    ...task,
    status,
    completedAt: status === "completed" ? new Date().toISOString() : task.completedAt,
    notes: notes?.trim().slice(0, 500) || task.notes,
  };
  const tasks = episode.tasks.map((t) => (t.id === taskId ? updated : t));
  await prisma.nursingEpisode.update({
    where: { visitId },
    data: { tasks },
  });
  await writePlatformAudit({
    ctx,
    module: "nurse",
    action: "task_updated",
    entityType: "visit",
    entityId: visitId,
    summary: `Task ${status} by ${operatorName}: ${task.title}`,
    payload: { taskId, status },
  });
  return updated;
}

export async function saveDischargeSummary(
  ctx: ServerContext,
  visitId: string,
  summary: Omit<DischargeSummary, "preparedBy" | "preparedAt">,
): Promise<DischargeSummary> {
  const { operatorId, operatorName } = await resolveNurseOperator(ctx);
  await assertNurseOwnsEpisode(ctx, visitId, operatorId);
  const record: DischargeSummary = {
    ...summary,
    preparedBy: operatorName,
    preparedAt: new Date().toISOString(),
  };
  await prisma.nursingEpisode.update({
    where: { visitId },
    data: { dischargeSummary: record },
  });
  await writePlatformAudit({
    ctx,
    module: "nurse",
    action: "discharge_summary_saved",
    entityType: "visit",
    entityId: visitId,
    summary: `Discharge summary prepared by ${operatorName}`,
    payload: { dischargeDate: record.dischargeDate },
  });
  return record;
}

export async function listNurseAuditLogs(
  ctx: ServerContext,
  input: { limit?: number; cursor?: string },
) {
  const limit = Math.min(100, Math.max(10, input.limit ?? 50));
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      module: "nurse",
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
