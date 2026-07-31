import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { prisma } from "@/lib/prisma";

const TENANT_ID = "tenant_navayu";
const DEFAULT_ADMIN_EMAIL = "admin@navayu.in";

export type EnsureAdminResult = {
  email: string;
  created: boolean;
  passwordUpdated: boolean;
  userId: string;
};

export async function ensureAdminAccount(input?: {
  email?: string;
  password?: string;
  tenantSlug?: string;
}): Promise<EnsureAdminResult> {
  const email = (input?.email ?? process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const password = input?.password ?? process.env.ADMIN_BOOTSTRAP_PASSWORD ?? process.env.ADMIN_PASSWORD;
  if (!password?.trim()) {
    throw new Error("ADMIN_BOOTSTRAP_PASSWORD is required to ensure admin account.");
  }

  const tenantSlug = (input?.tenantSlug ?? process.env.TENANT_SLUG ?? "navayu").trim().toLowerCase();
  let tenant = await db.tenant.findFirst({ where: { slug: tenantSlug } });
  if (!tenant) {
    tenant = await db.tenant.create({
      data: {
        id: TENANT_ID,
        slug: tenantSlug,
        name: "Navayu Spine & Joint Care",
        legalName: "ASP Global Health & Educare Pvt Ltd",
        timezone: "Asia/Kolkata",
        locale: "en-IN",
        active: true,
        settings: { orgPasswordHash: await hash("demo", 10) },
      },
    });
  } else if (!tenant.active) {
    await db.tenant.update({ where: { id: tenant.id }, data: { active: true } });
  }

  const branchCount = await db.branch.count({ where: { tenantId: tenant.id } });
  if (!branchCount) {
    await db.branch.createMany({
      data: [
        {
          id: "branch_gurgaon",
          tenantId: tenant.id,
          code: "GGN",
          name: "Gurgaon Center",
          city: "Gurgaon",
          state: "Haryana",
          country: "India",
          active: true,
        },
        {
          id: "branch_pataudi",
          tenantId: tenant.id,
          code: "PTD",
          name: "Pataudi",
          city: "Pataudi",
          state: "Haryana",
          country: "India",
          active: true,
        },
      ],
      skipDuplicates: true,
    });
  }

  const modules = ["admin", "frontdesk", "nurse", "doctor", "pharmacy", "laboratory", "counsellor", "crm", "hr"] as const;
  if (!(await db.role.count({ where: { tenantId: tenant.id } }))) {
    const permissions = modules.flatMap((module) => [
      {
        id: `perm_${module}_read`,
        module: module.toUpperCase() as Uppercase<typeof module>,
        action: "read",
        description: `${module} read`,
      },
      {
        id: `perm_${module}_write`,
        module: module.toUpperCase() as Uppercase<typeof module>,
        action: "write",
        description: `${module} write`,
      },
    ]);
    await db.permission.createMany({ data: permissions, skipDuplicates: true });
    await db.role.createMany({
      data: modules.map((module) => ({
        id: `role_${module}`,
        tenantId: tenant.id,
        name: `${module.toUpperCase()} Role`,
        key: module,
        module: module.toUpperCase() as Uppercase<typeof module>,
        isSystem: true,
      })),
      skipDuplicates: true,
    });
    await db.rolePermission.createMany({
      data: modules.flatMap((module) => [
        { roleId: `role_${module}`, permissionId: `perm_${module}_read` },
        { roleId: `role_${module}`, permissionId: `perm_${module}_write` },
      ]),
      skipDuplicates: true,
    });
  }

  await db.permission.createMany({
    data: [
      { id: "perm_laboratory_read", module: "LABORATORY", action: "read", description: "laboratory read" },
      { id: "perm_laboratory_write", module: "LABORATORY", action: "write", description: "laboratory write" },
    ],
    skipDuplicates: true,
  });
  const laboratoryRole = await db.role.upsert({
    where: { tenantId_key: { tenantId: tenant.id, key: "laboratory" } },
    update: {},
    create: {
      id: `role_laboratory_${tenant.id}`,
      tenantId: tenant.id,
      name: "LABORATORY Role",
      key: "laboratory",
      module: "LABORATORY",
      isSystem: true,
    },
  });
  await db.rolePermission.createMany({
    data: [
      { roleId: laboratoryRole.id, permissionId: "perm_laboratory_read" },
      { roleId: laboratoryRole.id, permissionId: "perm_laboratory_write" },
    ],
    skipDuplicates: true,
  });

  const adminRole = await db.role.findFirst({ where: { tenantId: tenant.id, key: "admin" } });
  const passwordHash = await hash(password.trim(), 10);

  let user = await db.user.findFirst({ where: { tenantId: tenant.id, email } });
  let created = false;
  let passwordUpdated = false;

  if (!user) {
    user = await db.user.create({
      data: {
        id: "user_admin",
        tenantId: tenant.id,
        branchId: "branch_gurgaon",
        email,
        name: "Hospital Admin",
        passwordHash,
        status: "ACTIVE",
        activeRoleId: adminRole?.id,
        userRoles: adminRole
          ? { create: { roleId: adminRole.id, branchId: "branch_gurgaon" } }
          : undefined,
      },
    });
    created = true;
    passwordUpdated = true;
  } else {
    await db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        status: "ACTIVE",
        branchId: user.branchId ?? "branch_gurgaon",
        activeRoleId: adminRole?.id ?? user.activeRoleId,
      },
    });
    passwordUpdated = true;
    if (adminRole) {
      const existingRole = await db.userRole.findFirst({
        where: { userId: user.id, roleId: adminRole.id, branchId: "branch_gurgaon" },
      });
      if (!existingRole) {
        await db.userRole.create({
          data: { userId: user.id, roleId: adminRole.id, branchId: "branch_gurgaon" },
        });
      }
    }
  }

  await prisma.adminStaff.upsert({
    where: { email },
    update: {
      name: "Hospital Admin",
      role: "super_admin",
      branchId: "branch_gurgaon",
      departmentIds: ["dept_spine", "dept_wellness"],
      onDuty: true,
    },
    create: {
      id: "st_admin",
      name: "Hospital Admin",
      email,
      phone: "+91 00000 00000",
      role: "super_admin",
      departmentIds: ["dept_spine", "dept_wellness"],
      branchId: "branch_gurgaon",
      onDuty: true,
      joinedAt: new Date().toISOString().slice(0, 10),
    },
  });

  return { email, created, passwordUpdated, userId: user.id };
}
