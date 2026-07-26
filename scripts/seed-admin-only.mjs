/**
 * Fresh install: tenant, branches, roles, and ONE admin login only.
 *
 *   node scripts/seed-admin-only.mjs
 *
 * Optional env:
 *   ADMIN_EMAIL=admin@yourhospital.in
 *   ADMIN_PASSWORD=YourSecurePassword123
 *   TENANT_SLUG=navayu
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const TENANT_ID = "tenant_navayu";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "admin@navayu.in").trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Candela@Admin2026";
const TENANT_SLUG = (process.env.TENANT_SLUG ?? "navayu").trim().toLowerCase();

const MODULES = ["admin", "frontdesk", "nurse", "doctor", "pharmacy", "laboratory", "counsellor", "crm", "hr"];

async function main() {
  const existingTenant = await prisma.tenant.findFirst({ where: { slug: TENANT_SLUG } });
  if (existingTenant) {
    console.log(`Tenant "${TENANT_SLUG}" already exists — updating admin user only.`);
  } else {
    await prisma.tenant.create({
      data: {
        id: TENANT_ID,
        slug: TENANT_SLUG,
        name: "Navayu Spine & Joint Care",
        legalName: "ASP Global Health & Educare Pvt Ltd",
        timezone: "Asia/Kolkata",
        locale: "en-IN",
        settings: { orgPasswordHash: await hash("demo", 10) },
      },
    });

    await prisma.branch.createMany({
      data: [
        {
          id: "branch_gurgaon",
          tenantId: TENANT_ID,
          code: "GGN",
          name: "Gurgaon",
          city: "Gurgaon",
          state: "Haryana",
          country: "India",
          active: true,
        },
        {
          id: "branch_pataudi",
          tenantId: TENANT_ID,
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

    const permissions = MODULES.flatMap((module) => [
      {
        id: `perm_${module}_read`,
        module: module.toUpperCase(),
        action: "read",
        description: `${module} read`,
      },
      {
        id: `perm_${module}_write`,
        module: module.toUpperCase(),
        action: "write",
        description: `${module} write`,
      },
    ]);
    await prisma.permission.createMany({ data: permissions, skipDuplicates: true });

    await prisma.role.createMany({
      data: MODULES.map((module) => ({
        id: `role_${module}`,
        tenantId: TENANT_ID,
        name: `${module.toUpperCase()} Role`,
        key: module,
        module: module.toUpperCase(),
        isSystem: true,
      })),
      skipDuplicates: true,
    });

    await prisma.rolePermission.createMany({
      data: MODULES.flatMap((module) => [
        { roleId: `role_${module}`, permissionId: `perm_${module}_read` },
        { roleId: `role_${module}`, permissionId: `perm_${module}_write` },
      ]),
      skipDuplicates: true,
    });
  }

  const tenantId = existingTenant?.id ?? TENANT_ID;
  const passwordHash = await hash(ADMIN_PASSWORD, 10);
  const adminRole = await prisma.role.findFirst({ where: { tenantId, key: "admin" } });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: ADMIN_EMAIL } },
    update: {
      name: "Hospital Admin",
      passwordHash,
      status: "ACTIVE",
      branchId: "branch_gurgaon",
      activeRoleId: adminRole?.id,
    },
    create: {
      id: "user_admin",
      tenantId,
      branchId: "branch_gurgaon",
      email: ADMIN_EMAIL,
      name: "Hospital Admin",
      passwordHash,
      status: "ACTIVE",
      activeRoleId: adminRole?.id,
      userRoles: adminRole
        ? { create: { roleId: adminRole.id, branchId: "branch_gurgaon" } }
        : undefined,
    },
  });

  await prisma.adminStaff.upsert({
    where: { email: ADMIN_EMAIL },
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
      email: ADMIN_EMAIL,
      phone: "+91 00000 00000",
      role: "super_admin",
      departmentIds: ["dept_spine", "dept_wellness"],
      branchId: "branch_gurgaon",
      onDuty: true,
      joinedAt: new Date().toISOString().slice(0, 10),
    },
  });

  const deptCount = await prisma.adminDepartment.count();
  if (!deptCount) {
    await prisma.adminDepartment.createMany({
      data: [
        {
          id: "dept_spine",
          label: "Spine & Joint Care",
          headStaffId: "st_admin",
          doctorIds: [],
          defaultPackageIds: ["pkg_basic", "pkg_regen"],
          bays: ["Physio Bay 1", "Physio Bay 2", "Procedure Room"],
          active: true,
        },
        {
          id: "dept_wellness",
          label: "Wellness & Metabolic",
          headStaffId: "st_admin",
          doctorIds: [],
          defaultPackageIds: ["pkg_wellness"],
          bays: ["Wellness Studio"],
          active: true,
        },
      ],
    });
  } else {
    const departments = await prisma.adminDepartment.findMany();
    for (const dept of departments) {
      const doctorIds = Array.isArray(dept.doctorIds)
        ? dept.doctorIds.map(String).filter((id) => !["dr_1", "dr_2", "dr_3"].includes(id))
        : [];
      await prisma.adminDepartment.update({
        where: { id: dept.id },
        data: { doctorIds },
      });
    }
  }

  console.log("\n=== Admin credentials (save these) ===");
  console.log(`Organization ID: ${TENANT_SLUG}`);
  console.log(`Organization password: demo  (change in tenant settings)`);
  console.log(`Branch: Gurgaon`);
  console.log(`Email: ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log("====================================\n");
  console.log("Add doctors and other staff from Admin → Staff & access.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
