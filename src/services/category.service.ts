// src/services/category.service.ts
import { PrismaClient } from '@prisma/client';

const CATEGORY_LEVEL = 2;
const DEPARTMENT_LEVEL = 3;

export async function getCategories(
  prisma: PrismaClient,
  institutionId: number
) {
  return prisma.role.findMany({
    where: {
      institutionId,
      roleHierarchyId: CATEGORY_LEVEL,
      code: { not: null },
    },
    include: {
      children: {
        where: {
          roleHierarchyId: DEPARTMENT_LEVEL,
          code: { not: null },
        },
        orderBy: { name: 'asc' },
      },
      users: {
        include: { user: true },
      },
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Used for dropdowns (Assign Category Head + Departments)
 */
export async function getCategoryMeta(
  prisma: PrismaClient,
  institutionId: number
) {
  const [users, departments] = await Promise.all([
    prisma.user.findMany({
      where: { institutionId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      orderBy: { firstName: 'asc' },
    }),
    prisma.role.findMany({
      where: {
        institutionId,
        roleHierarchyId: DEPARTMENT_LEVEL,
        code: { not: null },
      },
      select: {
        id: true,
        name: true,
        parentId: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  return { users, departments };
}

export async function createCategory(
  prisma: PrismaClient,
  institutionId: number,
  input: {
    name: string;
    code: string;
    headUserId: number;
    departmentIds: number[];
  }
) {
  return prisma.$transaction(async (tx) => {
    const root = await tx.role.findFirst({
      where: { institutionId, roleHierarchyId: 1 },
    });

    if (!root) throw new Error('Institution root missing');

    const category = await tx.role.create({
      data: {
        name: input.name,
        code: input.code,
        institutionId,
        parentId: root.id,
        roleHierarchyId: CATEGORY_LEVEL,
      },
    });

    await tx.userRole.create({
      data: {
        roleId: category.id,
        userId: BigInt(input.headUserId),
      },
    });

    if (input.departmentIds.length) {
      await tx.role.updateMany({
        where: {
          id: { in: input.departmentIds },
          institutionId,
          roleHierarchyId: DEPARTMENT_LEVEL,
        },
        data: { parentId: category.id },
      });
    }

    return category;
  });
}

export async function updateCategory(
  prisma: PrismaClient,
  categoryId: number,
  institutionId: number,
  input: {
    name?: string;
    code?: string;
    headUserId?: number;
    departmentIds?: number[];
  }
) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.role.findFirst({
      where: {
        id: categoryId,
        institutionId,
        roleHierarchyId: CATEGORY_LEVEL,
      },
    });

    if (!category) throw new Error('Category not found');

    const updated = await tx.role.update({
      where: { id: categoryId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.code && { code: input.code }),
      },
    });

    if (input.headUserId) {
      await tx.userRole.deleteMany({ where: { roleId: categoryId } });
      await tx.userRole.create({
        data: {
          roleId: categoryId,
          userId: BigInt(input.headUserId),
        },
      });
    }

    if (input.departmentIds) {
      // Clear old departments
      await tx.role.updateMany({
        where: {
          parentId: categoryId,
          roleHierarchyId: DEPARTMENT_LEVEL,
        },
        data: { parentId: null },
      });

      if (input.departmentIds.length) {
        await tx.role.updateMany({
          where: {
            id: { in: input.departmentIds },
            institutionId,
            roleHierarchyId: DEPARTMENT_LEVEL,
          },
          data: { parentId: categoryId },
        });
      }
    }

    return updated;
  });
}
