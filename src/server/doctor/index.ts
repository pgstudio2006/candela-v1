import type {
  ConsultationRecord,
  CounsellorQueueItem,
  DoctorProfile,
  DoctorTemplate,
  IpdPatient,
  PrescriptionLine,
  TreatmentMode,
} from "@/design-system/doctor-data";
import { DEMO_DOCTOR_ID } from "@/design-system/doctor-data";
import type { Patient, Visit } from "@/design-system/frontdesk-data";
import type { DocumentTemplate } from "@/design-system/document-templates";
import { validateCompleteConsultation } from "@/lib/doctor-validation";
import { visitVisibleInDoctorWorkspace } from "@/lib/doctor-queue";
import { isInReceptionQueue, isRedFlagVisit } from "@/lib/frontdesk-workflow";
import { prisma } from "@/lib/prisma";
import { getClinicalSnapshot } from "@/server/clinical";
import { resolveDoctorIdForContext, resolveDoctorProfile } from "@/server/clinical/roster";
import type { ServerContext } from "@/server/context";
import {
  assertDoctorOwnsVisit,
  requireDoctorConsult,
  requireDoctorVisit,
} from "@/server/doctor/guards";
import { ensureVisitDoctorAssignment } from "@/server/doctor/visit-claim";
import { ensureIpdWardBed, writeIpdRoundLog, getIpdRoundLog, findOnDutyNurseForWard } from "@/server/ipd";
import { ServerActionError } from "@/server/errors";
import { notifyPrescriptionWhatsapp } from "@/server/notifications";
import { sendWhatsAppAsync } from "@/server/whatsapp/service";
import { writePlatformAudit } from "@/server/platform-audit";
import { syncVisitFromOpdVisit } from "@/server/visit-sync";
import { branchScope, tenantScope } from "@/server/tenancy";

const PATAUDI_BRANCH_ID = "branch_pataudi";

function asRecord(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, string | number | boolean>;
}

function mapConsultation(row: {
  visitId: string;
  patientId: string;
  doctorId: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  treatmentMode: string;
  recommendCounsellor: boolean;
  skipCounsellor: boolean;
  packageId: string | null;
  counsellorNotes: string | null;
  doctorAdvice: string | null;
  whatsappRxSent: boolean;
  examination: unknown;
  diagnosis: unknown;
  treatment: unknown;
  prescription: unknown;
  notes: string;
  scribeTranscript: string | null;
  scribeLanguage: string | null;
  scribeAppliedAt: string | null;
  templateId: string | null;
  handoff: unknown;
}): ConsultationRecord {
  return {
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
    examination: asRecord(row.examination),
    diagnosis: asRecord(row.diagnosis),
    treatment: asRecord(row.treatment),
    prescription: (Array.isArray(row.prescription) ? row.prescription : []) as PrescriptionLine[],
    notes: row.notes,
    scribeTranscript: row.scribeTranscript ?? undefined,
    scribeLanguage: row.scribeLanguage ?? undefined,
    scribeAppliedAt: row.scribeAppliedAt ?? undefined,
    templateId: row.templateId ?? undefined,
    handoff: row.handoff ? asRecord(row.handoff) : undefined,
  };
}

export type JuniorExamSubmission = {
  visitId: string;
  data: Record<string, string | number | boolean>;
  submittedAt: string;
};

export type IpdRoundRecord = {
  id: string;
  kind: string;
  at: string;
  actorName: string;
  actorRole: string;
  content: string;
  data: Record<string, string | number | boolean> | null;
};

export type DoctorSnapshot = {
  patients: Patient[];
  visits: Visit[];
  activeDoctorId: string;
  profile: DoctorProfile;
  consultations: ConsultationRecord[];
  counsellorQueue: CounsellorQueueItem[];
  ipdPatients: IpdPatient[];
  templates: DoctorTemplate[];
  packages: Array<{ id: string; label: string; amount: number; sessions: number; dept: string }>;
  documentTemplates: DocumentTemplate[];
  juniorSubmissions: JuniorExamSubmission[];
};

async function loadCarePackages() {
  const adminPackages = await prisma.package.findMany({
    where: { active: true },
    include: { services: { include: { service: true } } },
    orderBy: { amount: "asc" },
  });
  return adminPackages.map((pkg) => ({
    id: pkg.id,
    label: pkg.label,
    amount: Number(pkg.amount),
    sessions: pkg.sessions ?? 6,
    dept: pkg.dept ?? "dept_general",
  }));
}

export async function getDoctorSnapshot(
  ctx: ServerContext,
  activeDoctorId?: string,
): Promise<DoctorSnapshot> {
  const profile = await resolveDoctorProfile(ctx);
  const doctorId = activeDoctorId ?? profile.doctorId;
  if (doctorId !== profile.doctorId) {
    throw new ServerActionError("FORBIDDEN", "You can only access your own doctor workspace.");
  }

  const [clinical, consultRows, queueRows, ipdRows, templateRows, docRows, packages, juniorRows] =
    await Promise.all([
      getClinicalSnapshot(ctx),
      prisma.consultation.findMany({
        where: { doctorId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.counsellorQueueItem.findMany({
        where: { doctorId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.ipdAdmission.findMany({
        where: { ...branchScope(ctx), attendingDoctorId: doctorId },
        include: { ward: true, bed: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.doctorTemplate.findMany({
        where: { ...branchScope(ctx), OR: [{ doctorId }, { isSystem: true }] },
        orderBy: { createdAt: "asc" },
      }),
      prisma.documentTemplate.findMany({ where: { ...tenantScope(ctx), OR: [{ branchId: ctx.branchId }, { branchId: null }] }, orderBy: { createdAt: "asc" } }),
      loadCarePackages(),
      prisma.formSubmission.findMany({
        where: { ...branchScope(ctx), formId: "junior-exam" },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const doctorConsultVisitIds = new Set(consultRows.map((row) => row.visitId));
  const deptIds = profile.departmentIds;
  const scopedVisits = clinical.visits.filter((v) =>
    visitVisibleInDoctorWorkspace(v, doctorId, deptIds, doctorConsultVisitIds, profile.name),
  );
  const branchVisitIds = new Set(scopedVisits.map((v) => v.id));
  const scopedPatientIds = new Set([
    ...scopedVisits.map((v) => v.patientId),
    ...consultRows.map((row) => row.patientId),
    ...ipdRows.map((row) => row.patientId),
  ]);
  const scopedPatients = clinical.patients.filter((p) => scopedPatientIds.has(p.id));
  const branchPatientIds = new Set(scopedPatients.map((p) => p.id));

  const juniorByVisit = new Map<string, JuniorExamSubmission>();
  for (const row of juniorRows) {
    if (!row.visitId || !branchVisitIds.has(row.visitId)) continue;
    if (juniorByVisit.has(row.visitId)) continue;
    juniorByVisit.set(row.visitId, {
      visitId: row.visitId,
      data: asRecord(row.data),
      submittedAt: row.submittedAt,
    });
  }

  return {
    patients: scopedPatients,
    visits: scopedVisits,
    activeDoctorId: doctorId,
    profile,
    consultations: consultRows.map(mapConsultation),
    counsellorQueue: queueRows
      .filter((row) => branchVisitIds.has(row.visitId))
      .map((row) => ({
        id: row.id,
        visitId: row.visitId,
        patientId: row.patientId,
        doctorId: row.doctorId,
        doctorName: row.doctorName,
        sentAt: String(row.sentAt),
        treatmentMode: row.treatmentMode as TreatmentMode,
        packageId: row.packageId ?? undefined,
        packageLabel: row.packageLabel ?? undefined,
        priority: row.priority as "normal" | "high",
        payload: asRecord(row.payload) as unknown as ConsultationRecord,
      })),
    ipdPatients: ipdRows.map((row) => ({
        id: row.id,
        visitId: row.visitId ?? undefined,
        patientId: row.patientId,
        ward: row.ward.label,
        bed: row.bed.label,
        category: row.ward.category,
        admittedAt: row.admittedAt.toISOString(),
        diagnosis: row.diagnosis,
        attendingDoctorId: row.attendingDoctorId,
        lastRoundAt: row.lastRoundAt?.toISOString() ?? undefined,
        lastRoundNote: row.lastRoundNote ?? undefined,
        status: row.status as IpdPatient["status"],
      })),
    templates: templateRows.map((row) => ({
      id: row.id,
      label: row.label,
      doctorId: row.doctorId,
      disease: row.disease,
      diagnosis: asRecord(row.diagnosis),
      treatment: asRecord(row.treatment),
      prescription: (Array.isArray(row.prescription) ? row.prescription : []) as PrescriptionLine[],
    })),
    packages,
    documentTemplates: docRows.map((row) => ({
      id: row.id,
      kind: row.kind as DocumentTemplate["kind"],
      label: row.label,
      layout: row.layout as DocumentTemplate["layout"],
      description: row.description ?? "",
      enabled: row.enabled,
      isSystem: row.isSystem,
    })),
    juniorSubmissions: [...juniorByVisit.values()],
  };
}

function juniorExamToConsultFields(junior: Record<string, string | number | boolean>) {
  const bpSys = junior.bpSystolic;
  const bpDia = junior.bpDiastolic;
  const vitalsBp = bpSys || bpDia ? `${bpSys ?? "—"}/${bpDia ?? "—"}` : "";
  return {
    examination: {
      chiefComplaint: String(junior.chiefComplaint ?? ""),
      painScale: junior.painScale ?? "",
      duration: String(junior.duration ?? ""),
      region: String(junior.region ?? ""),
      redFlags: Boolean(junior.redFlags),
      redFlagNotes: String(junior.redFlagNotes ?? ""),
      priorSurgery: Boolean(junior.priorSurgery),
      neuroDeficit: Boolean(junior.neuroDeficit),
      rom: String(junior.rom ?? ""),
      specialTests: String(junior.specialTests ?? ""),
      juniorImpression: String(junior.juniorImpression ?? ""),
      seniorHandoff: String(junior.seniorHandoff ?? ""),
      vitalsBp,
      vitalsPulse: junior.pulse ?? "",
      vitalsSpo2: junior.spo2 ?? "",
      vitalsWeight: junior.weight ?? "",
      vitalsTemperature: junior.temperature ?? "",
      vitalsHeight: junior.height ?? "",
      bpSystolic: junior.bpSystolic ?? "",
      bpDiastolic: junior.bpDiastolic ?? "",
      pulse: junior.pulse ?? "",
      temperature: junior.temperature ?? "",
      spo2: junior.spo2 ?? "",
      weight: junior.weight ?? "",
      height: junior.height ?? "",
    },
    diagnosis: { clinicalImpression: String(junior.juniorImpression ?? "") },
    treatment: { plan: String(junior.seniorHandoff ?? "") },
    notes: [
      junior.bpSystolic || junior.bpDiastolic
        ? `Vitals: BP ${junior.bpSystolic ?? "—"}/${junior.bpDiastolic ?? "—"} · Pulse ${junior.pulse ?? "—"} · SpO₂ ${junior.spo2 ?? "—"}%`
        : "",
      junior.seniorHandoff ? `Handoff: ${junior.seniorHandoff}` : "",
      junior.rom ? `ROM: ${junior.rom}` : "",
      junior.redFlagNotes ? `Red flags: ${junior.redFlagNotes}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export async function startConsultation(ctx: ServerContext, visitId: string) {
  const doctorId = await resolveDoctorIdForContext(ctx);
  await ensureVisitDoctorAssignment(ctx, visitId, doctorId);
  const visit = await requireDoctorVisit(ctx, visitId);

  const existing = await prisma.consultation.findUnique({ where: { visitId } });
  if (existing) {
    const juniorExam = await prisma.formSubmission.findFirst({
      where: { ...branchScope(ctx), formId: "junior-exam", visitId },
      orderBy: { createdAt: "desc" },
    });
    const junior = asRecord(juniorExam?.data);
    const exam = asRecord(existing.examination);
    const hasExamValues = Object.values(exam).some((v) => v !== "" && v !== false && v !== undefined && v !== null);
    if (juniorExam && !hasExamValues) {
      const fromJunior = juniorExamToConsultFields(junior);
      const updated = await prisma.consultation.update({
        where: { visitId },
        data: {
          examination: fromJunior.examination,
          diagnosis: fromJunior.diagnosis,
          treatment: fromJunior.treatment,
          notes: fromJunior.notes || existing.notes,
        },
      });
      await writePlatformAudit({
        ctx,
        module: "doctor",
        action: "consult_started",
        entityType: "visit",
        entityId: visitId,
        summary: `Consultation resumed with junior handoff for visit ${visitId}`,
      });
      return mapConsultation(updated);
    }
    return mapConsultation(existing);
  }

  const juniorExam = await prisma.formSubmission.findFirst({
    where: { ...branchScope(ctx), formId: "junior-exam", visitId },
    orderBy: { createdAt: "desc" },
  });
  const junior = asRecord(juniorExam?.data);
  const fromJunior = juniorExam ? juniorExamToConsultFields(junior) : null;

  const isPataudi = ctx.branchId === PATAUDI_BRANCH_ID;
  const created = await prisma.consultation.create({
    data: {
      id: `consult_${visitId}`,
      visitId,
      patientId: visit.patientId,
      doctorId,
      startedAt: new Date().toISOString(),
      status: "in_progress",
      treatmentMode: "opd",
      recommendCounsellor: !isPataudi,
      skipCounsellor: isPataudi,
      whatsappRxSent: false,
      examination: fromJunior?.examination ?? {},
      diagnosis: fromJunior?.diagnosis ?? {},
      treatment: fromJunior?.treatment ?? {},
      prescription: [],
      notes: fromJunior?.notes ?? "",
    },
  });

  await writePlatformAudit({
    ctx,
    module: "doctor",
    action: "consult_started",
    entityType: "visit",
    entityId: visitId,
    summary: `Consultation started for visit ${visitId}`,
  });

  return mapConsultation(created);
}

export async function skipConsultation(ctx: ServerContext, visitId: string) {
  const doctorId = await resolveDoctorIdForContext(ctx);
  const visit = await requireDoctorVisit(ctx, visitId);

  console.log("[skipConsultation] doctorId:", doctorId, "visitId:", visitId, "visit.doctorId:", visit.doctorId, "visit.stage:", visit.stage, "visit.billing:", visit.billing);

  if (!isInReceptionQueue(visit)) {
    throw new ServerActionError("VALIDATION", "Visit is not in the active queue.");
  }

  // If visit is not assigned to this doctor, assign it first
  if (visit.doctorId && visit.doctorId !== doctorId) {
    throw new ServerActionError("FORBIDDEN", "This visit is assigned to another doctor.");
  }

  const profile = await resolveDoctorProfile(ctx);
  const needsAssignment = !visit.doctorId;

  const maxToken = await prisma.opdVisit.aggregate({
    where: { ...branchScope(ctx), token: { not: null } },
    _max: { token: true },
  });
  const nextToken = (maxToken._max.token ?? 0) + 1;

  const routingNote = visit.routingNote
    ? `${visit.routingNote} · Skipped by ${profile.name}`
    : `Skipped by ${profile.name}`;

  await prisma.opdVisit.update({
    where: { id: visitId },
    data: {
      token: nextToken,
      routingNote,
      ...(needsAssignment ? { doctorId, doctorName: profile.name } : {}),
    },
  });

  const updated = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (updated) await syncVisitFromOpdVisit(ctx, updated);

  await writePlatformAudit({
    ctx,
    module: "doctor",
    action: "consult_skipped",
    entityType: "visit",
    entityId: visitId,
    summary: `Dr. ${profile.name} skipped consultation for visit ${visitId}`,
  });

  return { ok: true, token: nextToken };
}

export async function updateConsultation(
  ctx: ServerContext,
  visitId: string,
  patch: Partial<ConsultationRecord>,
) {
  const doctorId = await resolveDoctorIdForContext(ctx);
  const visit = await assertDoctorOwnsVisit(ctx, visitId, doctorId);

  const data: Record<string, unknown> = {};
  if (patch.completedAt !== undefined) data.completedAt = patch.completedAt;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.treatmentMode !== undefined) data.treatmentMode = patch.treatmentMode;
  if (patch.recommendCounsellor !== undefined) data.recommendCounsellor = patch.recommendCounsellor;
  if (patch.skipCounsellor !== undefined) data.skipCounsellor = patch.skipCounsellor;
  if (patch.packageId !== undefined) data.packageId = patch.packageId;
  if (patch.counsellorNotes !== undefined) data.counsellorNotes = patch.counsellorNotes;
  if (patch.doctorAdvice !== undefined) data.doctorAdvice = patch.doctorAdvice;
  if (patch.whatsappRxSent !== undefined) data.whatsappRxSent = patch.whatsappRxSent;
  if (patch.examination !== undefined) data.examination = patch.examination;
  if (patch.diagnosis !== undefined) data.diagnosis = patch.diagnosis;
  if (patch.treatment !== undefined) data.treatment = patch.treatment;
  if (patch.prescription !== undefined) data.prescription = patch.prescription;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.scribeTranscript !== undefined) data.scribeTranscript = patch.scribeTranscript;
  if (patch.scribeLanguage !== undefined) data.scribeLanguage = patch.scribeLanguage;
  if (patch.scribeAppliedAt !== undefined) data.scribeAppliedAt = patch.scribeAppliedAt;
  if (patch.templateId !== undefined) data.templateId = patch.templateId;
  if (patch.handoff !== undefined) data.handoff = patch.handoff;

  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.consultation.upsert({
    where: { visitId },
    create: {
      id: `consult_${visitId}`,
      visitId,
      patientId: visit.patientId,
      doctorId,
      startedAt: new Date().toISOString(),
      status: "in_progress",
      treatmentMode: "opd",
      recommendCounsellor: true,
      skipCounsellor: false,
      whatsappRxSent: false,
      examination: {},
      diagnosis: {},
      treatment: {},
      prescription: [],
      notes: "",
      ...data,
    },
    update: data,
  });
  return { ok: true };
}

export async function saveConsultSection(
  ctx: ServerContext,
  visitId: string,
  section: "examination" | "diagnosis" | "treatment",
  data: Record<string, string | number | boolean>,
) {
  const doctorId = await resolveDoctorIdForContext(ctx);
  await requireDoctorConsult(ctx, visitId, doctorId);
  const existing = await prisma.consultation.findUnique({ where: { visitId } });
  if (!existing) {
    throw new ServerActionError("NOT_FOUND", "Consultation not started — open the consult first.");
  }
  const nextSection = {
    ...asRecord(existing[section]),
    ...data,
  };
  await prisma.consultation.update({
    where: { visitId },
    data: { [section]: nextSection },
  });
  return { ok: true };
}

export async function setPrescription(ctx: ServerContext, visitId: string, lines: PrescriptionLine[]) {
  const doctorId = await resolveDoctorIdForContext(ctx);
  await requireDoctorConsult(ctx, visitId, doctorId);
  await prisma.consultation.update({
    where: { visitId },
    data: { prescription: lines },
  });
  return { ok: true };
}

function resolveCounsellorPriority(
  visit: { routingNote?: string | null; notes?: string | null },
  consult: ConsultationRecord,
  handoff: Record<string, string | number | boolean>,
): "normal" | "high" {
  const exam = consult.examination;
  if (isRedFlagVisit({ routingNote: visit.routingNote ?? undefined, notes: visit.notes ?? undefined }) || Boolean(exam.redFlags)) return "high";
  if (String(handoff.conversionPriority ?? "") === "high") return "high";
  return "normal";
}

export async function completeConsultation(
  ctx: ServerContext,
  visitId: string,
  opts: {
    treatmentMode: TreatmentMode;
    recommendCounsellor: boolean;
    skipCounsellor: boolean;
    handoff: Record<string, string | number | boolean>;
    sendWhatsapp: boolean;
  },
) {
  const doctorId = await resolveDoctorIdForContext(ctx);
  await ensureVisitDoctorAssignment(ctx, visitId, doctorId);
  const visit = await requireDoctorVisit(ctx, visitId);
  const consultRow = await requireDoctorConsult(ctx, visitId, doctorId);
  const consult = mapConsultation(consultRow);

  validateCompleteConsultation(consult, opts);

  const packageId = String(opts.handoff.packageId ?? "");
  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  const completedAt = new Date().toISOString();
  const updatedConsult: ConsultationRecord = {
    ...consult,
    status: "completed",
    completedAt,
    treatmentMode: opts.treatmentMode,
    recommendCounsellor: opts.recommendCounsellor,
    skipCounsellor: opts.skipCounsellor,
    packageId: packageId || undefined,
    counsellorNotes: String(opts.handoff.counsellorNotes ?? ""),
    doctorAdvice: String(opts.handoff.doctorAdvice ?? ""),
    handoff: opts.handoff,
    whatsappRxSent: opts.sendWhatsapp,
  };

  const needsCounsellor = opts.recommendCounsellor && !opts.skipCounsellor;
  const priority = resolveCounsellorPriority(visit, updatedConsult, opts.handoff);
  const diagnosisSummary = String(
    consult.diagnosis.primaryDiagnosis ?? consult.diagnosis.clinicalImpression ?? "Consult complete",
  );

  let nextStage = needsCounsellor ? "awaiting_counsellor" : "completed";
  let routingNote = visit.routingNote;
  let ipdAdmissionId = visit.ipdAdmissionId;

  if (opts.treatmentMode === "ipd" && !needsCounsellor) {
    nextStage = "ipd_admitted";
    routingNote =
      routingNote ??
      "Doctor recommended IPD admission — nursing intake, vitals, and consent required.";
  }

  await prisma.$transaction(async (tx) => {
    await tx.consultation.update({
      where: { visitId },
      data: {
        status: "completed",
        completedAt,
        treatmentMode: opts.treatmentMode,
        recommendCounsellor: opts.recommendCounsellor,
        skipCounsellor: opts.skipCounsellor,
        packageId: updatedConsult.packageId,
        counsellorNotes: updatedConsult.counsellorNotes,
        doctorAdvice: updatedConsult.doctorAdvice,
        handoff: opts.handoff,
        whatsappRxSent: opts.sendWhatsapp,
      },
    });

    if (opts.treatmentMode === "ipd") {
      ipdAdmissionId = `ipd_${visitId}`;
      const wardLabel = String(opts.handoff.ward ?? "MSK Ward A");
      const bedLabel = String(opts.handoff.bed ?? "A-14");
      const { wardId, bedId } = await ensureIpdWardBed(tx, ctx, wardLabel, bedLabel, "general");
      await tx.ipdAdmission.upsert({
        where: { visitId },
        update: {
          diagnosis: diagnosisSummary,
          attendingDoctorId: doctorId,
          status: "admitted",
          wardId,
          bedId,
        },
        create: {
          id: ipdAdmissionId,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          visitId,
          patientId: visit.patientId,
          wardId,
          bedId,
          doctorName: visit.doctorName ?? doctorId,
          patientType: "general",
          billingMode: "prepaid",
          admittedAt: new Date(),
          diagnosis: diagnosisSummary,
          attendingDoctorId: doctorId,
          status: "admitted",
        },
      });

      // Auto-assign nurse based on ward (fall back to any on-duty nurse)
      const assignedNurse = await findOnDutyNurseForWard(tx, ctx, wardLabel);

      await tx.nursingHandoff.upsert({
        where: { visitId },
        update: {
          ipdWard: wardLabel,
          ipdBed: String(opts.handoff.bed ?? "A-14"),
        },
        create: {
          id: `nh_${visitId}`,
          visitId,
          patientId: visit.patientId,
          patientName: (visit as any).patientName ?? "",
          uhid: (visit as any).uhid ?? "",
          doctorId,
          doctorName: visit.doctorName ?? "",
          treatmentPath: "ipd",
          packageId: packageId || "",
          packageLabel: pkg?.label ?? "",
          billingStatus: (visit as any).billingStatus ?? "pending",
          amountPaid: visit.amountPaid ?? 0,
          balanceDue: visit.balanceDue ?? 0,
          netAmount: (visit.amountPaid ?? 0) + (visit.balanceDue ?? 0),
          commercialConsent: false,
          billingHandoff: opts.handoff,
          consultation: updatedConsult,
          ipdWard: wardLabel,
          ipdBed: String(opts.handoff.bed ?? "A-14"),
          sentAt: completedAt,
        },
      });

      if (assignedNurse) {
        // Create nursing episode for assigned nurse
        await tx.nursingEpisode.create({
          data: {
            id: `ep_${visitId}`,
            visitId,
            patientId: visit.patientId,
            nurseId: assignedNurse.id,
            nurseName: assignedNurse.name,
            branchId: ctx.branchId,
            treatmentPath: "ipd",
            packageLabel: pkg?.label ?? "",
            packageId: packageId || "",
            doctorName: visit.doctorName ?? "",
            doctorId,
            billingStatus: (visit as any).billingStatus ?? "pending",
            balanceDue: visit.balanceDue ?? 0,
            status: "queued",
            priority: "high",
            queuedAt: completedAt,
            consents: [],
            sessions: [],
            internalNotes: "",
            tasks: [],
          },
        });
      }
    }

    await tx.opdVisit.update({
      where: { id: visitId },
      data: {
        stage: nextStage,
        treatmentPath: opts.treatmentMode === "ipd" ? "ipd" : visit.treatmentPath,
        ipdAdmissionId: ipdAdmissionId ?? undefined,
        routingNote,
      },
    });

    if (needsCounsellor) {
      const doctorName = visit.doctorName ?? doctorId;
      await tx.counsellorQueueItem.upsert({
        where: { visitId },
        update: {
          patientId: visit.patientId,
          doctorId,
          doctorName: String(doctorName),
          sentAt: completedAt,
          treatmentMode: opts.treatmentMode,
          packageId,
          packageLabel: pkg?.label ?? null,
          priority,
          payload: JSON.parse(JSON.stringify(updatedConsult)) as object,
        },
        create: {
          id: `cq_${visitId}`,
          visitId,
          patientId: visit.patientId,
          doctorId,
          doctorName: String(doctorName),
          sentAt: completedAt,
          treatmentMode: opts.treatmentMode,
          packageId,
          packageLabel: pkg?.label ?? null,
          priority,
          payload: JSON.parse(JSON.stringify(updatedConsult)) as object,
        },
      });
    }
  });

  const updatedOpd = await prisma.opdVisit.findUnique({ where: { id: visitId } });
  if (updatedOpd) await syncVisitFromOpdVisit(ctx, updatedOpd);

  if (consult.prescription?.length) {
    try {
      const patient = await prisma.patient.findUnique({ where: { id: visit.patientId } });
      const { pushPrescriptionToPharmacy } = await import("@/server/pharmacy-rx-bridge");
      await pushPrescriptionToPharmacy(ctx, {
        visitId,
        patientId: visit.patientId,
        patientName: patient?.name ?? patient?.fullName ?? "Patient",
        uhid: patient?.uhid ?? "",
        doctorId,
        doctorName: visit.doctorName ?? doctorId,
        lines: consult.prescription as PrescriptionLine[],
      });
    } catch {
      /* Rx bridge is best-effort — consult completion must still succeed */
    }
  }

  if (opts.sendWhatsapp && consult.prescription?.length) {
    const patient = await prisma.patient.findUnique({ where: { id: visit.patientId } });
    if (patient?.phone) {
      await notifyPrescriptionWhatsapp(ctx, {
        patientName: patient.name ?? patient.fullName ?? "Patient",
        phone: patient.phone,
        visitId,
        lineCount: consult.prescription.length,
      });

      // WhatsApp: send prescription notification via template (Gurgaon only)
      try {
        await sendWhatsAppAsync(ctx, "prescription_sent", patient.phone, {
          patientName: patient.name ?? patient.fullName ?? "Patient",
          itemCount: consult.prescription.length,
          doctorName: visit.doctorName ?? doctorId,
        });
      } catch (e) {
        console.error("[whatsapp] prescription trigger failed:", e);
      }
    }
  }

  // WhatsApp: send visit thank-you + Google review link (Gurgaon only)
  try {
    const patient = await prisma.patient.findUnique({ where: { id: visit.patientId } });
    if (patient?.phone) {
      await sendWhatsAppAsync(ctx, "visit_thankyou_review", patient.phone, {
        patientName: patient.name ?? patient.fullName ?? "Patient",
      });
    }
  } catch (e) {
    console.error("[whatsapp] visit thank-you trigger failed:", e);
  }

  await writePlatformAudit({
    ctx,
    module: "doctor",
    action: "consult_completed",
    entityType: "visit",
    entityId: visitId,
    summary: needsCounsellor
      ? `Consult completed — sent to counsellor (${opts.treatmentMode})`
      : `Consult completed (${opts.treatmentMode})`,
    severity: priority === "high" ? "warning" : "info",
    payload: { treatmentMode: opts.treatmentMode, priority },
  });
}

export async function createDoctorTemplate(
  ctx: ServerContext,
  doctorId: string,
  tpl: Omit<DoctorTemplate, "id" | "doctorId">,
) {
  const resolvedId = await resolveDoctorIdForContext(ctx);
  if (doctorId !== resolvedId) {
    throw new ServerActionError("FORBIDDEN", "You can only create templates in your own workspace.");
  }
  const id = `tpl_custom_${Date.now()}`;
  await prisma.doctorTemplate.create({
    data: {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      doctorId,
      label: tpl.label,
      disease: tpl.disease,
      diagnosis: tpl.diagnosis,
      treatment: tpl.treatment,
      prescription: tpl.prescription,
      isSystem: false,
    },
  });
  await writePlatformAudit({
    ctx,
    module: "doctor",
    action: "template_created",
    entityType: "doctor_template",
    entityId: id,
    summary: `Template created: ${tpl.label}`,
  });
  return id;
}

export async function updateDoctorTemplate(ctx: ServerContext, id: string, patch: Partial<DoctorTemplate>) {
  const resolvedId = await resolveDoctorIdForContext(ctx);
  const existing = await prisma.doctorTemplate.findFirst({ where: { id, tenantId: ctx.tenantId, branchId: ctx.branchId } });
  if (!existing || existing.isSystem) {
    throw new ServerActionError("NOT_FOUND", "Template not found or not editable.");
  }
  if (existing.doctorId !== resolvedId) {
    throw new ServerActionError("FORBIDDEN", "You can only edit your own templates.");
  }
  await prisma.doctorTemplate.update({
    where: { id },
    data: {
      label: patch.label,
      disease: patch.disease,
      diagnosis: patch.diagnosis,
      treatment: patch.treatment,
      prescription: patch.prescription,
    },
  });
}

export async function deleteDoctorTemplate(ctx: ServerContext, id: string) {
  const resolvedId = await resolveDoctorIdForContext(ctx);
  const deleted = await prisma.doctorTemplate.deleteMany({
    where: { id, doctorId: resolvedId, isSystem: false, tenantId: ctx.tenantId, branchId: ctx.branchId },
  });
  if (!deleted.count) {
    throw new ServerActionError("NOT_FOUND", "Template not found or not deletable.");
  }
  await writePlatformAudit({
    ctx,
    module: "doctor",
    action: "template_deleted",
    entityType: "doctor_template",
    entityId: id,
    summary: `Template deleted: ${id}`,
  });
}

export async function saveIpdRound(
  ctx: ServerContext,
  ipdId: string,
  note: Record<string, string | number | boolean>,
) {
  const doctorId = await resolveDoctorIdForContext(ctx);
  const profile = await resolveDoctorProfile(ctx);
  const ipd = await prisma.ipdAdmission.findFirst({ where: { id: ipdId, ...branchScope(ctx) }, include: { ward: true, bed: true } });
  if (!ipd) throw new ServerActionError("NOT_FOUND", "IPD admission not found.");
  if (!ipd.visitId) throw new ServerActionError("VALIDATION", "IPD admission has no linked visit.");
  await requireDoctorVisit(ctx, ipd.visitId);
  if (ipd.attendingDoctorId !== doctorId && doctorId !== DEMO_DOCTOR_ID) {
    throw new ServerActionError("FORBIDDEN", "You are not the attending doctor for this admission.");
  }

  const text = `S: ${note.subjective}\nO: ${note.objective}\nA: ${note.assessment}\nP: ${note.plan}`;
  const now = new Date().toISOString();
  const submissionId = `ipd_round_${ipdId}_${Date.now()}`;

  await prisma.$transaction([
    prisma.ipdAdmission.update({
      where: { id: ipdId },
      data: { lastRoundAt: new Date(), lastRoundNote: text },
    }),
    prisma.formSubmission.create({
      data: {
        id: submissionId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        formId: "doctor-ipd-round",
        patientId: ipd.patientId,
        visitId: ipd.visitId,
        data: note,
        submittedAt: now,
      },
    }),
    prisma.ipdRoundLog.create({
      data: {
        id: `ipdlog_${ipdId}_${Date.now()}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        ipdAdmissionId: ipdId,
        visitId: ipd.visitId,
        kind: "doctor_round",
        actorId: doctorId,
        actorName: profile.name,
        actorRole: "doctor",
        content: text,
        payload: { ...note, sourceSubmissionId: submissionId } as unknown as object,
      },
    }),
  ]);

  await writePlatformAudit({
    ctx,
    module: "doctor",
    action: "ipd_round_saved",
    entityType: "ipd_admission",
    entityId: ipdId,
    summary: `Ward round recorded for ${ipd.ward.label} bed ${ipd.bed.label}`,
  });
}

export async function getIpdRoundHistory(ctx: ServerContext, ipdId: string): Promise<IpdRoundRecord[]> {
  const ipd = await prisma.ipdAdmission.findFirst({ where: { id: ipdId, ...branchScope(ctx) } });
  if (!ipd || !ipd.visitId) return [];
  await requireDoctorVisit(ctx, ipd.visitId);

  const logs = await getIpdRoundLog(ctx, ipdId);

  const legacy = await prisma.formSubmission.findMany({
    where: { ...branchScope(ctx), formId: "doctor-ipd-round", visitId: ipd.visitId },
    orderBy: { createdAt: "desc" },
  });

  const loggedSubmissionIds = new Set(
    logs
      .map((l) => l.data?.sourceSubmissionId)
      .filter((v): v is string => typeof v === "string"),
  );

  const legacyEntries: IpdRoundRecord[] = legacy
    .filter((row) => !loggedSubmissionIds.has(row.id))
    .map((row) => {
      const data = asRecord(row.data);
      return {
        id: row.id,
        kind: "doctor_round",
        at: String(row.submittedAt),
        actorName: "Doctor",
        actorRole: "doctor",
        content: `S: ${data.subjective ?? ""}\nO: ${data.objective ?? ""}\nA: ${data.assessment ?? ""}\nP: ${data.plan ?? ""}`,
        data,
      };
    });

  const all = [...logs, ...legacyEntries].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  return all;
}

export async function listDoctorAuditLogs(
  ctx: ServerContext,
  input: { limit?: number; cursor?: string },
) {
  const limit = Math.min(100, Math.max(10, input.limit ?? 50));
  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      module: "doctor",
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

export async function addDocumentTemplate(
  ctx: ServerContext,
  kind: DocumentTemplate["kind"],
  label: string,
  description: string,
) {
  await resolveDoctorIdForContext(ctx);
  await prisma.documentTemplate.create({
    data: {
      id: `doc_custom_${Date.now()}`,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      kind,
      label,
      layout: "navayu-letterhead",
      description,
      enabled: true,
      isSystem: false,
    },
  });
}

export async function saveDocumentTemplate(ctx: ServerContext, template: DocumentTemplate) {
  await resolveDoctorIdForContext(ctx);
  await prisma.documentTemplate.upsert({
    where: { id: template.id },
    update: {
      kind: template.kind,
      label: template.label,
      layout: template.layout,
      description: template.description,
      enabled: template.enabled,
      isSystem: template.isSystem,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
    },
    create: {
      id: template.id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      kind: template.kind,
      label: template.label,
      layout: template.layout,
      description: template.description,
      enabled: template.enabled,
      isSystem: template.isSystem,
    },
  });
}
