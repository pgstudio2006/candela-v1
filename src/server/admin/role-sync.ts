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
    where: { email: user.email },
    select: { role: true },
  });

  const targetRoleKey = staff?.role
    ? moduleRoleForStaffRole(staff.role as HealthcareStaffRole)
    : undefined;

  if (!targetRoleKey || user.activeRole?.key === targetRoleKey) {
    return fallbackRole;
  }

  const role = await db.role.upsert({
    where: { tenantId_key: { tenantId: user.tenantId, key: targetRoleKey } },
    update: {},
    create: {
      id: `role_${targetRoleKey}_${user.tenantId}`,
      tenantId: user.tenantId,
      name: `${targetRoleKey.toUpperCase()} Role`,
      key: targetRoleKey,
      module: targetRoleKey.toUpperCase() as any,
      isSystem: true,
    },
  });

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
