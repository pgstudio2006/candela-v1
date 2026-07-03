import { patientDisplayName } from "@/lib/frontdesk-workflow";
import { prisma } from "@/lib/prisma";
import type { ServerContext } from "@/server/context";
import { branchScope } from "@/server/tenancy";

const unscopedClinicalWhere = {
  OR: [
    { tenantId: null },
    { branchId: null },
    { tenantId: "" },
    { branchId: "" },
  ],
};

const unscopedIpdWhere = {
  OR: [{ tenantId: "" }, { branchId: "" }],
};

/** Assign legacy rows missing tenant/branch to the active session branch. */
export async function backfillBranchScope(ctx: ServerContext) {
  const scope = branchScope(ctx);

  await prisma.patient.updateMany({
    where: unscopedClinicalWhere,
    data: scope,
  });
  await prisma.opdVisit.updateMany({
    where: unscopedClinicalWhere,
    data: scope,
  });
  await prisma.ipdAdmission.updateMany({
    where: unscopedIpdWhere,
    data: scope,
  });

  const branchVisitIds = (
    await prisma.opdVisit.findMany({ where: scope, select: { id: true } })
  ).map((v) => v.id);
  if (branchVisitIds.length > 0) {
    await prisma.appointment.updateMany({
      where: {
        visitId: { in: branchVisitIds },
        OR: [{ branchId: null }, { tenantId: null }, { branchId: "" }, { tenantId: "" }],
      },
      data: scope,
    });
  }

  const nullNamePatients = await prisma.patient.findMany({
    where: {
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      OR: [{ name: null }, { name: "" }],
    },
    select: { id: true, fullName: true, uhid: true },
  });
  for (const row of nullNamePatients) {
    const name = patientDisplayName(row);
    await prisma.patient.update({ where: { id: row.id }, data: { name } });
  }
}

/** Backfill then return strict branch scope for writes and post-backfill reads. */
export async function ensureBranchClinicalScope(ctx: ServerContext) {
  await backfillBranchScope(ctx);
  return branchScope(ctx);
}
