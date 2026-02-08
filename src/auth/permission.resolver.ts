import { PrismaClient } from '@prisma/client';

/**
 * Resolves the effective access context for a user in an institution.
 *
 * Flow (RBAC):
 * 1. plan_role_permissions = template (plan + role_hierarchy → default permissions), not institution-specific.
 * 2. When institution/roles are created, default permissions are copied into role_permissions (per role, per institution).
 * 3. user_roles = which roles the user has (roles are institution-scoped).
 * 4. User's base permissions = role_permissions for all roles the user has in this institution.
 * 5. user_permission_overrides = grant or revoke specific permissions for this user.
 * 6. Effective permissions = (base from role_permissions − revoked overrides) ∪ granted overrides.
 */
export async function resolveAccessContext(
  prisma: PrismaClient,
  userId: bigint,
  institutionId?: number
) {
  if (!institutionId) {
    return {
      plan_code: 'system',
      permissions: ['*'] as string[],
      modules: [] as { code: string; name: string; icon: string | null; category: string | null; sort_order: number }[],
    };
  }

  /**
   * 1. Get user's roles for this institution only (roles are institution-scoped).
   */
  const userRoles = await prisma.user_roles.findMany({
    where: {
      user_id: userId,
      role: { institution_id: institutionId },
    },
    select: { role_id: true },
  });

  const roleIds = userRoles.map((r) => r.role_id);

  /**
   * 2. Resolve institution plan (for plan_code in response).
   */
  const institution = await prisma.institutions.findUnique({
    where: { id: institutionId },
    include: { plan: true },
  });
  const planCode = institution?.plan?.code ?? 'basic';

  /**
   * 3. Base permissions from role_permissions (for user's roles in this institution).
   */
  let basePermissionIds: number[] = [];
  if (roleIds.length > 0) {
    const rolePerms = await prisma.role_permissions.findMany({
      where: { role_id: { in: roleIds } },
      select: { permission_id: true },
    });
    basePermissionIds = rolePerms.map((rp) => rp.permission_id);
  }

  /**
   * 4. User permission overrides: grant (add) and revoke (remove).
   * - grant: include permission if not revoked and not expired.
   * - revoke: exclude permission from effective set.
   */
  const now = new Date();
  const overrides = await prisma.user_permission_overrides.findMany({
    where: { user_id: userId },
  });

  const revokedIds = new Set(
    overrides.filter((o) => o.override_type === 'revoke').map((o) => o.permission_id)
  );
  const grantedIds = new Set(
    overrides
      .filter(
        (o) =>
          o.override_type === 'grant' &&
          o.revoked_at == null &&
          (o.expires_at == null || o.expires_at > now)
      )
      .map((o) => o.permission_id)
  );

  /**
   * 5. Final permission IDs: (base − revoked) ∪ granted
   */
  const finalPermissionIds = [
    ...new Set([
      ...basePermissionIds.filter((id) => !revokedIds.has(id)),
      ...grantedIds,
    ]),
  ];

  if (finalPermissionIds.length === 0) {
    return {
      plan_code: planCode,
      permissions: [],
      modules: [],
    };
  }

  /**
   * 6. Load permission details (code, feature, module) for effective permissions.
   */
  const permissionsWithModule = await prisma.permissions.findMany({
    where: { id: { in: finalPermissionIds } },
    include: {
      feature: {
        include: { module: true },
      },
    },
  });

  const permissionSet = new Set<string>();
  const moduleMap = new Map<
    string,
    { code: string; name: string; icon: string | null; category: string | null; sort_order: number }
  >();

  for (const permission of permissionsWithModule) {
    const feature = permission.feature;
    const module = feature?.module;
    if (!feature || !module) continue;

    permissionSet.add(permission.permission_code);
    if (!moduleMap.has(module.code)) {
      moduleMap.set(module.code, {
        code: module.code,
        name: module.name,
        icon: module.icon,
        category: module.category,
        sort_order: module.sort_order,
      });
    }
  }

  return {
    plan_code: planCode,
    permissions: Array.from(permissionSet),
    modules: Array.from(moduleMap.values()).sort((a, b) => a.sort_order - b.sort_order),
  };
}
