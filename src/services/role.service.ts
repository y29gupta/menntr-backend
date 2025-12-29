import { PrismaClient } from '@prisma/client';

/**
 * ---------------------------------------------------------
 * ROLE SERVICE
 * ---------------------------------------------------------
 * Responsibilities:
 * - Create default role hierarchy for institutions
 * - Fetch institution root roles safely
 * - Assign permissions to roles with plan validation
 * ---------------------------------------------------------
 */

/**
 * Create default role hierarchy for a new institution
 *
 * Hierarchy:
 * Institution Admin (level 1)
 *   └── Category Admin (level 2)
 *         └── Department Admin (level 3)
 *               └── Faculty (level 4)
 *
 * Student (level 5, independent)
 */
export async function createDefaultRoles(
  prisma: PrismaClient,
  institutionId: number
): Promise<void> {
  // 1️⃣ Institution Admin (root)
  const institutionAdmin = await prisma.role.create({
    data: {
      name: 'Institution Admin',
      institutionId,
      roleHierarchyId: 1,
      isSystemRole: true,
    },
  });

  // 2️⃣ Category Admin
  const categoryAdmin = await prisma.role.create({
    data: {
      name: 'Category Admin',
      institutionId,
      parentId: institutionAdmin.id,
      roleHierarchyId: 2,
    },
  });

  // 3️⃣ Department Admin
  const departmentAdmin = await prisma.role.create({
    data: {
      name: 'Department Admin',
      institutionId,
      parentId: categoryAdmin.id,
      roleHierarchyId: 3,
    },
  });

  // 4️⃣ Faculty
  await prisma.role.create({
    data: {
      name: 'Faculty',
      institutionId,
      parentId: departmentAdmin.id,
      roleHierarchyId: 4,
    },
  });

  // 5️⃣ Student (no parent, lowest level)
  await prisma.role.create({
    data: {
      name: 'Student',
      institutionId,
      roleHierarchyId: 5,
    },
  });
}

/**
 * Get Institution Admin role (root role)
 * Safe & deterministic (never rely on parentId = null)
 */
export async function getInstitutionAdminRole(
  prisma: PrismaClient,
  institutionId: number
) {
  return prisma.role.findFirst({
    where: {
      institutionId,
      roleHierarchyId: 1,
    },
  });
}

/**
 * Assign permissions to a role
 * Validates permissions against institution's active plan
 */
export async function assignPermissionsToRole(
  prisma: PrismaClient,
  roleId: number,
  permissionIds: number[],
  institutionId: number
) {
  if (!permissionIds.length) {
    return { count: 0 };
  }

  // 1️⃣ Validate permissions allowed by plan
  const allowedPermissions = await prisma.permission.findMany({
    where: {
      id: { in: permissionIds },
      feature: {
        planFeatures: {
          some: {
            included: true,
            plan: {
              institutions: {
                some: { id: institutionId },
              },
            },
          },
        },
      },
    },
  });

  if (allowedPermissions.length !== permissionIds.length) {
    throw new Error('One or more permissions are not allowed by the plan');
  }

  // 2️⃣ Assign permissions
  return prisma.rolePermission.createMany({
    data: allowedPermissions.map((permission) => ({
      roleId,
      permissionId: permission.id,
    })),
    skipDuplicates: true,
  });
}

/**
 * Fetch full role hierarchy for an institution
 * Used by UI tree view
 */
export async function getInstitutionRoles(
  prisma: PrismaClient,
  institutionId: number
) {
  return prisma.role.findMany({
    where: { institutionId },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Create a child role under a parent
 * Used for Category / Department creation
 */
export async function createChildRole(
  prisma: PrismaClient,
  params: {
    name: string;
    institutionId: number;
    parentId: number;
    roleHierarchyId: number;
  }
) {
  return prisma.role.create({
    data: {
      name: params.name,
      institutionId: params.institutionId,
      parentId: params.parentId,
      roleHierarchyId: params.roleHierarchyId,
    },
  });
}

/**
 * Move a role under a new parent
 * Used for drag & drop hierarchy changes
 */
export async function moveRole(
  prisma: PrismaClient,
  roleId: number,
  newParentId: number | null
) {
  return prisma.role.update({
    where: { id: roleId },
    data: { parentId: newParentId },
  });
}

/**
 * Delete a role
 * (Children must be handled at controller level if needed)
 */
export async function deleteRole(
  prisma: PrismaClient,
  roleId: number
) {
  return prisma.role.delete({
    where: { id: roleId },
  });
}
