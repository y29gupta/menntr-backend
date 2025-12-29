import { PrismaClient } from '@prisma/client';

const DEPARTMENT_LEVEL = 3;
const CATEGORY_LEVEL = 2;

export interface CreateDepartmentInput {
  name: string;
  code: string;
  categoryId?: number | null;
  hodUserId?: number;
}

export interface UpdateDepartmentInput {
  name?: string;
  code?: string;
  categoryId?: number | null;
  hodUserId?: number;
}

/**
 * List departments
 */
export async function getDepartments(
  prisma: PrismaClient,
  institutionId: number,
  page = 1,
  limit = 10,
  search = ''
) {
  const [rows, total] = await Promise.all([
    prisma.role.findMany({
      where: {
        institutionId,
        roleHierarchyId: DEPARTMENT_LEVEL,
        name: { contains: search, mode: 'insensitive' },
      },
      include: {
        parent: true, // category
        users: {
          include: { user: true }, // HOD
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.role.count({
      where: { institutionId, roleHierarchyId: DEPARTMENT_LEVEL },
    }),
  ]);

  return { rows, total };
}

/**
 * Create department
 */
export async function createDepartment(
  prisma: PrismaClient,
  institutionId: number,
  input: CreateDepartmentInput
) {
  return prisma.$transaction(async (tx) => {
    // Validate category if provided
    if (input.categoryId) {
      const category = await tx.role.findFirst({
        where: {
          id: input.categoryId,
          institutionId,
          roleHierarchyId: CATEGORY_LEVEL,
        },
      });

      if (!category) {
        throw new Error('Invalid category');
      }
    }

    const department = await tx.role.create({
      data: {
        name: input.name,
        code: input.code,
        institutionId,
        parentId: input.categoryId ?? null,
        roleHierarchyId: DEPARTMENT_LEVEL,
      },
    });

    if (input.hodUserId) {
      await tx.userRole.create({
        data: {
          roleId: department.id,
          userId: BigInt(input.hodUserId),
        },
      });
    }

    return department;
  });
}

/**
 * Update department
 */
export async function updateDepartment(
  prisma: PrismaClient,
  departmentId: number,
  institutionId: number,
  input: UpdateDepartmentInput
) {
  return prisma.$transaction(async (tx) => {
    const department = await tx.role.findFirst({
      where: {
        id: departmentId,
        institutionId,
        roleHierarchyId: DEPARTMENT_LEVEL,
      },
    });

    if (!department) {
      throw new Error('Department not found');
    }

    if (input.categoryId !== undefined) {
      if (input.categoryId !== null) {
        const category = await tx.role.findFirst({
          where: {
            id: input.categoryId,
            institutionId,
            roleHierarchyId: CATEGORY_LEVEL,
          },
        });

        if (!category) {
          throw new Error('Invalid category');
        }
      }
    }

    const updated = await tx.role.update({
      where: { id: departmentId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.code && { code: input.code }),
        ...(input.categoryId !== undefined && {
          parentId: input.categoryId,
        }),
      },
    });

    if (input.hodUserId) {
      await tx.userRole.deleteMany({
        where: { roleId: departmentId },
      });

      await tx.userRole.create({
        data: {
          roleId: departmentId,
          userId: BigInt(input.hodUserId),
        },
      });
    }

    return updated;
  });
}
