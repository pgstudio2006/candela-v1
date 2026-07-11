import { mapPrismaPatientRow } from "@/lib/frontdesk-workflow";
import { prisma } from "@/lib/prisma";
import type { Patient } from "@/design-system/frontdesk-data";
import { assertNotViewer, type AdminOperator } from "@/server/admin/guards";
import { backfillBranchScope } from "@/server/branch-scope";
import { deletePatientsByIds } from "@/server/clinical/delete-patient";
import type { ServerContext } from "@/server/context";
import { ServerActionError } from "@/server/errors";
import { writePlatformAudit } from "@/server/platform-audit";
import { branchScope } from "@/server/tenancy";

export type AdminPatientHistory = {
  patient: Patient;
  visits: {
    id: string;
    token: number | null;
    stage: string;
    doctorName: string | null;
    checkInAt: string | null;
    billAmount: number | null;
    amountPaid: number | null;
    balanceDue: number | null;
    billing: string;
    createdAt: string;
  }[];
  invoices: {
    id: string;
    invoiceNo: string;
    grandTotal: number;
    status: string;
    createdAt: string;
  }[];
  formSubmissions: {
    id: string;
    formId: string;
    visitId: string | null;
    createdAt: string;
    summary: string;
    data: Record<string, unknown>;
  }[];
  consultations: {
    id: string;
    visitId: string;
    doctorId: string | null;
    status: string;
    startedAt: string;
    completedAt: string | null;
    notes: string | null;
    diagnosisSummary: string;
  }[];
  appointments: {
    id: string;
    date: string;
    time: string;
    status: string;
    doctorName: string | null;
  }[];
  warning: string | null;
};

export async function searchAdminPatients(
  ctx: ServerContext,
  input: { q?: string; page?: number; pageSize?: number; view?: "all" | "balance" | "today" },
) {
  await backfillBranchScope(ctx);
  const scope = branchScope(ctx);
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, input.pageSize ?? 25));
  const q = input.q?.trim();

  let patientIdsFilter: string[] | undefined;
  if (input.view === "today") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const visits = await prisma.opdVisit.findMany({
      where: {
        ...scope,
        checkInAt: { not: null },
        updatedAt: { gte: todayStart },
      },
      select: { patientId: true },
    });
    patientIdsFilter = [...new Set(visits.map((v) => v.patientId))];
    if (patientIdsFilter.length === 0) {
      return { patients: [], total: 0, page, pageSize };
    }
  }

  const where = {
    AND: [
      scope,
      ...(input.view === "balance" ? [{ balance: { gt: 0 } }] : []),
      ...(patientIdsFilter ? [{ id: { in: patientIdsFilter } }] : []),
      ...(q
        ? [
            {
              OR: [
                { uhid: { contains: q, mode: "insensitive" as const } },
                { name: { contains: q, mode: "insensitive" as const } },
                { fullName: { contains: q, mode: "insensitive" as const } },
                { phone: { contains: q } },
              ],
            },
          ]
        : []),
    ],
  };

  const [rows, total, departments] = await Promise.all([
    prisma.patient.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.patient.count({ where }),
    prisma.adminDepartment.findMany({ where: scope, select: { id: true, label: true } }),
  ]);

  const deptMap = new Map(departments.map((d) => [d.id, d.label]));

  return {
    patients: rows.map((row) => {
      const p = mapPrismaPatientRow(row);
      const deptId = p.departmentId || p.department;
      if (deptId && deptMap.has(deptId)) {
        p.department = deptMap.get(deptId)!;
      }
      return p;
    }),
    total,
    page,
    pageSize,
  };
}

export async function getAdminPatientHistory(
  ctx: ServerContext,
  patientId: string,
): Promise<AdminPatientHistory> {
  await backfillBranchScope(ctx);
  const scope = branchScope(ctx);

  const patientRow = await prisma.patient.findFirst({
    where: { id: patientId, ...scope },
  });
  if (!patientRow) {
    throw new ServerActionError("NOT_FOUND", "Patient not found in this hospital.");
  }

  const warnings: string[] = [];

  async function safeQuery<T extends unknown[]>(label: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      console.error(`[getAdminPatientHistory] ${label} failed for patient ${patientId}:`, err);
      warnings.push(`Could not load ${label}.`);
      return [] as unknown as T;
    }
  }

  const [visits, invoices, submissions, appointments] = await Promise.all([
    safeQuery("visits", () =>
      prisma.opdVisit.findMany({
        where: { patientId, ...scope },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ),
    safeQuery("invoices", () =>
      prisma.invoice.findMany({
        where: { patientId, tenantId: ctx.tenantId, branchId: ctx.branchId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ),
    safeQuery("forms", () =>
      prisma.formSubmission.findMany({
        where: { patientId, ...scope },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ),
    safeQuery("appointments", () =>
      prisma.appointment.findMany({
        where: { patientId, ...scope },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ),
  ]);

  const visitIds = visits.map((v) => v.id);
  const consultations = visitIds.length
    ? await safeQuery("consultations", () =>
        prisma.consultNote.findMany({
          where: { visitId: { in: visitIds } },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      )
    : [];

  const patient = mapPrismaPatientRow(patientRow);

  return {
    patient,
    visits: visits.map((v) => ({
      id: v.id,
      token: v.token,
      stage: v.stage,
      doctorName: v.doctorName,
      checkInAt: v.checkInAt ?? null,
      billAmount: v.billAmount,
      amountPaid: v.amountPaid,
      balanceDue: v.balanceDue,
      billing: v.billing ?? "pending",
      createdAt: v.createdAt.toISOString(),
    })),
    invoices: invoices.map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNumber,
      grandTotal: Number(inv.totalAmount),
      status: inv.status,
      createdAt: inv.createdAt.toISOString(),
    })),
    formSubmissions: submissions.map((s) => {
      const data = (s.data ?? {}) as Record<string, unknown>;
      const preview =
        typeof data.notes === "string"
          ? data.notes
          : typeof data.internalNotes === "string"
            ? data.internalNotes
            : typeof data.chiefComplaint === "string"
              ? data.chiefComplaint
              : JSON.stringify(data).slice(0, 80);
      return {
        id: s.id,
        formId: s.formId,
        visitId: s.visitId,
        createdAt: s.createdAt.toISOString(),
        summary: preview || "—",
        data,
      };
    }),
    consultations: consultations.map((c) => {
      const dx = (c.diagnosis ?? {}) as Record<string, unknown>;
      const diagnosisSummary =
        typeof dx.primaryDiagnosis === "string"
          ? dx.primaryDiagnosis
          : typeof dx.icdCode === "string"
            ? dx.icdCode
            : c.notes?.slice(0, 120) || "—";
      return {
        id: c.id,
        visitId: c.visitId,
        doctorId: c.doctorId ?? null,
        status: c.status,
        startedAt: c.createdAt.toISOString(),
        completedAt: null,
        notes: c.notes ?? null,
        diagnosisSummary,
      };
    }),
    appointments: appointments.map((a) => ({
      id: a.id,
      date: a.date ?? "—",
      time: a.time ?? "—",
      status: a.status,
      doctorName: a.doctorName,
    })),
    warning: warnings.length ? warnings.join(" ") : null,
  };
}

export async function deleteAdminPatient(
  ctx: ServerContext,
  operator: AdminOperator,
  patientId: string,
): Promise<{ deleted: boolean; patientName: string }> {
  assertNotViewer(operator);
  await backfillBranchScope(ctx);

  const patientRow = await prisma.patient.findFirst({
    where: { id: patientId, ...branchScope(ctx) },
    select: { id: true, fullName: true, name: true },
  });
  if (!patientRow) {
    throw new ServerActionError("NOT_FOUND", "Patient not found in this hospital.");
  }

  const patientName = patientRow.fullName?.trim() || patientRow.name?.trim() || patientId;
  
  try {
    const count = await deletePatientsByIds([patientId], ctx);
    if (count === 0) {
      throw new ServerActionError("INTERNAL_ERROR", "Could not delete patient.");
    }
  } catch (e) {
    console.error("Error in deletePatientsByIds:", e);
    throw e;
  }

  try {
    await writePlatformAudit({
      ctx,
      actor: operator.name,
      actorRole: operator.staffRole,
      module: "admin",
      action: "patient_deleted",
      entityType: "patient",
      entityId: patientId,
      summary: `Patient deleted: ${patientName}`,
      severity: "warning",
    });
  } catch (e) {
    console.error("Error writing audit log:", e);
    // Don't fail the deletion if audit logging fails
  }

  return { deleted: true, patientName };
}
