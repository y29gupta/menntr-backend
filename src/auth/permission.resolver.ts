import { PrismaClient } from '@prisma/client';

export async function resolveAccessContext(
  prisma: PrismaClient,
  userId: bigint,
  institutionId?: number
) {
    if (!institutionId) {
      return {
        plan_code: 'system',
        permissions: ['*'],
        modules: [],
      };
    }
  /**
   * 1. Get user roles + hierarchy
   */
  const userRoles = await prisma.user_roles.findMany({
    where: { user_id: userId },
    include: {
      role: {
        include: {
          hierarchy: true,
        },
      },
    },
  });

  const hierarchyIds = userRoles
    .map((r) => r.role.hierarchy?.id)
    .filter((id): id is number => Boolean(id));

  if (!hierarchyIds.length) {
    return {
      plan_code: 'basic',
      permissions: [],
      modules: [],
    };
  }

  /**
   * 2. Resolve plan
   */
  let planCode = 'basic';

  if (institutionId) {
    const institution = await prisma.institutions.findUnique({
      where: { id: institutionId },
      include: { plan: true },
    });

    if (institution?.plan?.code) {
      planCode = institution.plan.code;
    }
  }

  /**
   * 3. Resolve permissions
   */
  const planPermissions = await prisma.plan_role_permissions.findMany({
    where: {
      plan_code: planCode,
      role_hierarchy_id: { in: hierarchyIds },
    },
    include: {
      permissions: {
        include: {
          feature: {
            include: {
              module: true,
            },
          },
        },
      },
    },
  });

  const permissionSet = new Set<string>();
  const moduleMap = new Map<string, any>();

  for (const p of planPermissions) {
    const permission = p.permissions;

    if (!permission?.feature || !permission.feature.module) {
      continue;
    }
    
    permissionSet.add(permission.permission_code);

    const module = permission.feature.module;

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
