import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/id";
import { nextUhid, patientDisplayName } from "@/lib/frontdesk-workflow";
import { maxUhidCounterInBranch } from "@/server/clinical";
import type { ServerContext } from "@/server/context";
import { ServerActionError } from "@/server/errors";
import { branchScope } from "@/server/tenancy";
import { writePlatformAudit } from "@/server/platform-audit";
import { syncVisitFromOpdVisit } from "@/server/visit-sync";
import { loadClinicalRoster } from "@/server/clinical/roster";
import { resolveDoctorName } from "@/lib/clinical-roster";

export async function registerEmergency(
  ctx: ServerContext,
  input: {
    name?: string;
    phone?: string;
    age?: number;
    gender?: string;
    complaint: string;
    mlc?: boolean;
    mlcDetails?: string;
    broughtBy?: string;
    policeStation?: string;
    firNumber?: string;
    admitToIpd?: boolean;
    wardId?: string;
    bedId?: string;
    attendingDoctorId?: string;
    patientType?: string;
    expectedDischarge?: string;
    vitals?: Record<string, string | number | boolean>;
  },
) {
  const scope = branchScope(ctx);
  const patientId = createId("pat");
  const visitId = createId("vis");
  const emergencyPatientId = createId("emp");

  const branchPatientCounter = await maxUhidCounterInBranch(ctx);
  const uhid = nextUhid(branchPatientCounter + 1, ctx.branchId);
  const patientName = input.name?.trim() || "Unknown";
  const patientPhone = input.phone?.trim() || "Unknown";
  const now = new Date().toISOString();

  const roster = input.attendingDoctorId ? await loadClinicalRoster(ctx) : null;
  const doctorName = input.attendingDoctorId && roster ? resolveDoctorName(input.attendingDoctorId, roster) : null;

  await prisma.$transaction(async (tx) => {
    await tx.patient.create({
      data: {
        id: patientId,
        ...scope,
        uhid,
        name: patientName,
        fullName: patientName,
        phone: patientPhone,
        age: input.age ?? null,
        gender: input.gender ?? null,
        status: "emergency",
      },
    });

    await tx.emergencyPatient.create({
      data: {
        id: emergencyPatientId,
        ...scope,
        patientId,
        name: patientName,
        phone: patientPhone,
        age: input.age ?? null,
        gender: input.gender ?? null,
        complaint: input.complaint,
        mlc: input.mlc ?? false,
        mlcDetails: input.mlcDetails ?? null,
        broughtBy: input.broughtBy ?? null,
        policeStation: input.policeStation ?? null,
        firNumber: input.firNumber ?? null,
      },
    });

    await tx.opdVisit.create({
      data: {
        id: visitId,
        ...scope,
        patientId,
        stage: "emergency",
        departmentId: "dept_emergency",
        doctorId: input.attendingDoctorId ?? null,
        doctorName: doctorName ?? input.attendingDoctorId ?? "Emergency team",
        billing: "pending",
        exam: "not_started",
        appointment: false,
        waitMin: 0,
        checkInAt: now,
        treatmentPath: "emergency",
        complaint: input.complaint,
        routingNote: `Emergency registration${input.mlc ? " · MLC" : ""}`,
        diagnosis: { complaint: input.complaint, mlc: input.mlc, mlcDetails: input.mlcDetails },
      },
    });

    // Sync the canonical Visit row so vitals and other visit-scoped records can reference it.
    const opd = await tx.opdVisit.findUnique({ where: { id: visitId } });
    if (opd) {
      await syncVisitFromOpdVisit(ctx, opd, tx);
    }

    if (input.mlc) {
      await tx.formSubmission.create({
        data: {
          id: `mlc_${visitId}`,
          ...scope,
          formId: "emergency-mlc",
          patientId,
          visitId,
          data: {
            mlc: true,
            mlcDetails: input.mlcDetails ?? "",
            broughtBy: input.broughtBy ?? "",
            policeStation: input.policeStation ?? "",
            firNumber: input.firNumber ?? "",
          },
          submittedAt: now,
        },
      });
    }

    if (input.vitals && Object.keys(input.vitals).length > 0) {
      const vitalPayload: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(input.vitals)) {
        if (value !== undefined) vitalPayload[key] = value as string | number | boolean;
      }
      await tx.vitals.create({
        data: {
          id: createId("vit"),
          branchId: ctx.branchId,
          visitId,
          bpSystolic: typeof input.vitals.bpSystolic === "number" ? input.vitals.bpSystolic : null,
          bpDiastolic: typeof input.vitals.bpDiastolic === "number" ? input.vitals.bpDiastolic : null,
          pulse: typeof input.vitals.pulse === "number" ? input.vitals.pulse : null,
          spo2: typeof input.vitals.spo2 === "number" ? input.vitals.spo2 : null,
          temperature: typeof input.vitals.temperature === "number" ? input.vitals.temperature : null,
          weight: typeof input.vitals.weight === "number" ? input.vitals.weight : null,
          painScore: typeof input.vitals.painScore === "number" ? input.vitals.painScore : null,
          notes: String(input.vitals.notes ?? ""),
          recordedAt: new Date(),
          recordedBy: ctx.userId,
          payload: vitalPayload,
        },
      });
    }

    if (input.admitToIpd) {
      if (!input.wardId || !input.bedId) {
        throw new ServerActionError("VALIDATION", "Select a ward and bed before admitting emergency patient to IPD.");
      }
      const bed = await tx.ipdBed.findFirst({
        where: { id: input.bedId, wardId: input.wardId, branchId: scope.branchId, active: true },
        include: { ward: true },
      });
      if (!bed) throw new ServerActionError("NOT_FOUND", "Selected bed not found.");
      const occupant = await tx.ipdAdmission.findFirst({
        where: {
          tenantId: scope.tenantId,
          branchId: scope.branchId,
          bedId: bed.id,
          status: { in: ["admitted", "discharge_planned"] },
        },
      });
      if (occupant) throw new ServerActionError("CONFLICT", "Selected bed is already occupied.");

      const ipdId = `ipd_${visitId}`;
      await tx.ipdAdmission.create({
        data: {
          id: ipdId,
          ...scope,
          visitId,
          patientId,
          wardId: bed.wardId,
          bedId: bed.id,
          doctorName: doctorName ?? input.attendingDoctorId ?? "Emergency team",
          diagnosis: input.complaint,
          patientType: input.patientType ?? "emergency",
          billingMode: "postpaid",
          expectedDischarge: input.expectedDischarge ? new Date(input.expectedDischarge) : null,
          admittedAt: new Date(),
          attendingDoctorId: input.attendingDoctorId ?? "emergency",
          status: "admitted",
        },
      });
      await tx.opdVisit.update({
        where: { id: visitId },
        data: { ipdAdmissionId: ipdId, stage: "ipd_admitted", treatmentPath: "ipd" },
      });
    }
  });

  await writePlatformAudit({
    ctx,
    module: "frontdesk",
    action: "emergency_registered",
    entityType: "emergency_visit",
    entityId: visitId,
    summary: `Emergency registration: ${patientName} (${input.mlc ? "MLC" : "non-MLC"})${input.admitToIpd ? " · admitted to IPD" : ""}`,
    payload: { mlc: input.mlc, admitToIpd: input.admitToIpd, complaint: input.complaint },
  });

  return { patientId, visitId, uhid };
}

export async function getEmergencyVisits(ctx: ServerContext) {
  const scope = branchScope(ctx);
  const rows = await prisma.opdVisit.findMany({
    where: { ...scope, stage: { in: ["emergency", "ipd_admitted"] }, treatmentPath: { in: ["emergency", "ipd"] } },
    include: {
      patient: {
        include: { emergencyRecords: { take: 1 } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    patientName: patientDisplayName(r.patient) ?? r.patientId,
    uhid: r.patient.uhid,
    phone: r.patient.phone,
    age: r.patient.age,
    gender: r.patient.gender,
    complaint: r.complaint ?? "",
    stage: r.stage,
    treatmentPath: r.treatmentPath,
    doctorName: r.doctorName,
    ipdAdmissionId: r.ipdAdmissionId,
    createdAt: r.createdAt.toISOString(),
  }));
}
