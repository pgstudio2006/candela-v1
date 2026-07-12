import { db } from "@/lib/db";
import type { ServerContext } from "@/server/context";
import { ServerActionError } from "@/server/errors";

const PERM_CACHE = new Map<string, Set<string>>();

async function loadPermissions(userId: string, tenantId: string, roleKey: string): Promise<Set<string>> {
  const cacheKey = `${userId}:${tenantId}:${roleKey}`;
  if (PERM_CACHE.has(cacheKey)) return PERM_CACHE.get(cacheKey)!;

  const role = await db.role.findFirst({
    where: { key: roleKey, tenantId },
    include: { permissions: { include: { permission: true } } },
  });

  const keys = new Set(
    role?.permissions.map((rp) => rp.permission.id) ?? [],
  );
  PERM_CACHE.set(cacheKey, keys);
  return keys;
}

export async function hasPermission(
  ctx: ServerContext,
  permissionKey: string,
): Promise<boolean> {
  const perms = await loadPermissions(ctx.userId, ctx.tenantId, ctx.role);
  return perms.has(permissionKey);
}

export async function requirePermission(
  ctx: ServerContext,
  permissionKey: string,
): Promise<void> {
  const ok = await hasPermission(ctx, permissionKey);
  if (!ok) {
    throw new ServerActionError("FORBIDDEN", `Missing permission: ${permissionKey}`);
  }
}

/** Admin role can access any module; other roles need explicit cross-module permission */
export async function canAccessModule(ctx: ServerContext, module: string): Promise<boolean> {
  if (ctx.role === module) return true;
  if (ctx.role === "admin") return true;
  const readKey = `perm_${module}_read`;
  const writeKey = `perm_${module}_write`;
  const perms = await loadPermissions(ctx.userId, ctx.tenantId, ctx.role);
  return perms.has(readKey) || perms.has(writeKey);
}
