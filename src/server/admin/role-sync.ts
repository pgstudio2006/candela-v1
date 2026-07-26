import { db } from "@/lib/db";
import {
  moduleRoleForStaffRole,
  type HealthcareStaffRole,
} from "@/lib/healthcare-roles";

/**
 * Resolves the platform role that a user should have based on their linked
 * AdminStaff record. If the user's activeRole does not match the staff role,
 * this creates/updates the correct Role, UserRole and activeRoleId.
 *
 * This is especially important for legacy deployments where lab technicians
 * and other staff were created without a valid platform role, causing modules
 * like Laboratory to redirect or return 403/500.
 */
export async function resolveEffectiveRoleForUser(
  userId: string,
  branchId: string,
): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      tenantId: true,
      email: true,
      activeRole: { select: { id: true, key: true } },
      userRoles: { select: { role: { select: { id: true, key: true } } } },
    },
  });

  if (!user) return "frontdesk";

  const fallbackRole =
    user.activeRole?.key ?? user.userRoles[0]?.role.key ?? "frontdesk";

  if (!user.email) return fallbackRole;

  const staff = await db.adminStaff.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { role: true },
  });

  const rawStaffRole = staff?.role?.trim().toLowerCase();
  let targetRoleKey = rawStaffRole
    ? moduleRoleForStaffRole(rawStaffRole as HealthcareStaffRole)
    : undefined;

  if (!targetRoleKey && rawStaffRole && /lab|laboratory/.test(rawStaffRole)) {
    targetRoleKey = "laboratory";
  }

  if (!targetRoleKey || user.activeRole?.key === targetRoleKey) {
    return fallbackRole;
  }

  const role = await ensureRoleWithPermissions(user.tenantId, targetRoleKey);

  await db.user.update({
    where: { id: user.id },
    data: { activeRoleId: role.id },
  });

  await db.userRole.upsert({
    where: {
      userId_roleId_branchId: {
        userId: user.id,
        roleId: role.id,
        branchId,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: role.id,
      branchId,
    },
  });

  return targetRoleKey;
}

async function ensureRoleWithPermissions(tenantId: string, roleKey: string) {
  const moduleName = roleKey.toUpperCase();
  const role = await db.role.upsert({
    where: { tenantId_key: { tenantId, key: roleKey } },
    update: {},
    create: {
      id: `role_${roleKey}_${tenantId}`,
      tenantId,
      name: `${moduleName} Role`,
      key: roleKey,
      module: moduleName as any,
      isSystem: true,
    },
  });

  const readPermId = `perm_${roleKey}_read`;
  const writePermId = `perm_${roleKey}_write`;

  await db.permission.createMany({
    data: [
      { id: readPermId, module: moduleName as any, action: "read", description: `${roleKey} read` },
      { id: writePermId, module: moduleName as any, action: "write", description: `${roleKey} write` },
    ],
    skipDuplicates: true,
  });

  await db.rolePermission.createMany({
    data: [
      { roleId: role.id, permissionId: readPermId },
      { roleId: role.id, permissionId: writePermId },
    ],
    skipDuplicates: true,
  });

  return role;
}
