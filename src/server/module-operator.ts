import { db } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { HR_MANAGER_ID } from "@/design-system/hr-data";
import { PHARMACY_MANAGER_ID } from "@/design-system/pharmacy-data";
import { CRM_MANAGER_ID } from "@/lib/crm-auth";
import { requireModule } from "@/server/auth";
import type { ServerContext } from "@/server/context";
import { ServerActionError } from "@/server/errors";

export async function resolveHrOperator(requireManager = false) {
  const ctx = await requireModule("hr");
  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true, name: true } });
  if (!user?.email) {
    throw new ServerActionError("UNAUTHORIZED", "HR account is not linked to this login.");
  }
  const employee = await prisma.hrEmployee.findFirst({
    where: { email: user.email.toLowerCase(), active: true },
  });
  if (!employee) {
    throw new ServerActionError("FORBIDDEN", "No HR employee profile found for this account.");
  }
  const isManager = employee.id === HR_MANAGER_ID || employee.role === "manager";
  if (requireManager && !isManager) {
    throw new ServerActionError("FORBIDDEN", "Manager access required.");
  }
  return { ctx, operatorId: employee.id, isManager, employee, userName: user.name ?? employee.name };
}

export async function resolveCrmOperator() {
  const ctx = await requireModule("crm");
  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true } });
  if (!user?.email) {
    throw new ServerActionError("UNAUTHORIZED", "CRM account is not linked to this login.");
  }
  const cred = await prisma.crmOperatorCredential.findUnique({
    where: { email: user.email.toLowerCase() },
  });
  if (!cred?.active) {
    throw new ServerActionError("FORBIDDEN", "No CRM operator profile found for this account.");
  }
  const isManager = cred.id === CRM_MANAGER_ID || cred.role === "manager";
  return { ctx, operatorId: cred.id, isManager, operatorName: cred.name };
}

export async function resolvePharmacyOperator() {
  const ctx = await requireModule("pharmacy");
  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true } });
  if (!user?.email) {
    throw new ServerActionError("UNAUTHORIZED", "Pharmacy account is not linked to this login.");
  }
  const cred = await prisma.pharmacyOperatorCredential.findUnique({
    where: { email: user.email.toLowerCase() },
  });
  if (!cred?.active) {
    throw new ServerActionError("FORBIDDEN", "No pharmacy operator profile found for this account.");
  }
  const isManager = cred.id === PHARMACY_MANAGER_ID || cred.role === "manager";
  return { ctx, operatorId: cred.id, isManager, operatorName: cred.name };
}

export async function resolveNurseOperator(ctx: ServerContext) {
  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true, name: true } });
  if (!user?.email) {
    throw new ServerActionError("UNAUTHORIZED", "Nurse account is not linked to this login.");
  }
  const staff = await prisma.adminStaff.findFirst({
    where: { email: user.email.toLowerCase(), branchId: ctx.branchId },
    select: { id: true, ward: true } as any,
  });
  return {
    operatorId: staff?.id ?? ctx.userId,
    operatorName: user.name ?? "Nurse",
    ward: (staff as any)?.ward,
  };
}

export async function resolveCounsellorOperator() {
  const ctx = await requireModule("counsellor");
  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true, name: true } });
  if (!user?.email) {
    throw new ServerActionError("UNAUTHORIZED", "Counsellor account is not linked to this login.");
  }
  const cred = await prisma.counsellorOperatorCredential.findUnique({
    where: { email: user.email.toLowerCase() },
  });
  if (cred?.active) {
    return { ctx, operatorId: cred.id, operatorName: cred.name };
  }
  return { ctx, operatorId: ctx.userId, operatorName: user.name ?? "Counsellor" };
}

export async function resolveAdminOperator() {
  const ctx = await requireModule("admin");
  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { email: true, name: true },
  });
  if (!user?.email) {
    throw new ServerActionError("UNAUTHORIZED", "Admin account is not linked to this login.");
  }
  const email = user.email.toLowerCase();
  const staff = await prisma.adminStaff.findFirst({
    where: {
      email,
      OR: [{ branchId: ctx.branchId }, { branchId: "" }],
    },
  });
  if (staff) {
    const { buildAdminOperator } = await import("@/server/admin/guards");
    let operator = buildAdminOperator({
      operatorId: staff.id,
      name: staff.name,
      email: staff.email,
      staffRole: staff.role,
    });
    if (ctx.role === "admin" && !operator.canManageConfig) {
      operator = buildAdminOperator({
        operatorId: staff.id,
        name: staff.name,
        email: staff.email,
        staffRole: "super_admin",
      });
    }
    return { ctx, operator };
  }
  const { buildAdminOperator } = await import("@/server/admin/guards");
  return {
    ctx,
    operator: buildAdminOperator({
      operatorId: ctx.userId,
      name: user.name ?? "Admin",
      email,
      staffRole: "super_admin",
    }),
  };
}
