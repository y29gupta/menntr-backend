import { PrismaClient } from '@prisma/client';

export interface CreateCategoryInput {
  name: string;
  code: string;
  headUserId: number;
  departmentIds: number[];
}

export interface UpdateCategoryInput {
  name?: string;
  code?: string;
  headUserId?: number;
  departmentIds?: number[];
}


/**
 * List categories for an institution
 */
export async function getCategories(
  prisma: PrismaClient,
  institutionId: number
) {
  return prisma.role.findMany({
    where: {
      institutionId,
      roleHierarchyId: 2, // Category Admin
    },
    include: {
      children: {
        where: { roleHierarchyId: 3 }, // Departments
        orderBy: { name: 'asc' },
      },
      users: {
        include: { user: true }, // Assigned category head
      },
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Create category
 */
export async function createCategory(
  prisma: PrismaClient,
  institutionId: number,
  input: CreateCategoryInput
) {
  return prisma.$transaction(async (tx) => {
    const root = await tx.role.findFirst({
      where: { institutionId, roleHierarchyId: 1 },
    });

    if (!root) {
      throw new Error('Institution Admin role missing');
    }

    const category = await tx.role.create({
      data: {
        name: input.name,
        code: input.code,
        institutionId,
        parentId: root.id,
        roleHierarchyId: 2,
      },
    });

    await tx.userRole.create({
      data: {
        userId: BigInt(input.headUserId),
        roleId: category.id,
      },
    });

    if (input.departmentIds.length) {
      await tx.role.updateMany({
        where: {
          id: { in: input.departmentIds },
          institutionId,
          roleHierarchyId: 3,
        },
        data: { parentId: category.id },
      });
    }

    return category;
  });
}


/**
 * Update category
 */
export async function updateCategory(
  prisma: PrismaClient,
  categoryId: number,
  institutionId: number,
  input: UpdateCategoryInput
) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.role.findFirst({
      where: {
        id: categoryId,
        institutionId,
        roleHierarchyId: 2,
      },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    const updated = await tx.role.update({
      where: { id: categoryId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.code && { code: input.code }),
      },
    });

    if (input.headUserId) {
      await tx.userRole.deleteMany({
        where: { roleId: categoryId },
      });

      await tx.userRole.create({
        data: {
          roleId: categoryId,
          userId: BigInt(input.headUserId),
        },
      });
    }

    if (input.departmentIds) {
      await tx.role.updateMany({
        where: {
          parentId: categoryId,
          roleHierarchyId: 3,
        },
        data: { parentId: null },
      });

      if (input.departmentIds.length) {
        await tx.role.updateMany({
          where: {
            id: { in: input.departmentIds },
            institutionId,
            roleHierarchyId: 3,
          },
          data: { parentId: categoryId },
        });
      }
    }

    return updated;
  });
}

