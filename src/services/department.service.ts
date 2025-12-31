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
  hodUserId?: number | null;
}

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

        
        isSystemRole: false,

        name: { contains: search, mode: 'insensitive' },
      },
      include: {
        parent: true, // Category (nullable)
        users: {
          include: { user: true }, // HOD
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),

    prisma.role.count({
      where: {
        institutionId,
        roleHierarchyId: DEPARTMENT_LEVEL,
        isSystemRole: false,
      },
    }),
  ]);

  return { rows, total };
}




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
          code: { not: null },
        },
      });

      if (!category) {
        throw new Error('Invalid category');
      }
    }

    // Prevent duplicate department code
    const exists = await tx.role.findFirst({
      where: {
        institutionId,
        roleHierarchyId: DEPARTMENT_LEVEL,
        code: input.code,
      },
    });

    if (exists) {
      throw new Error('Department code already exists');
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

    // Assign HOD
    if (input.hodUserId) {
      const hod = await tx.user.findFirst({
        where: {
          id: BigInt(input.hodUserId),
          institutionId,
        },
      });

      if (!hod) {
        throw new Error('Invalid HOD user');
      }

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
        code: { not: null },
      },
    });

    if (!department) {
      throw new Error('Department not found');
    }

    // Validate category
    if (input.categoryId !== undefined && input.categoryId !== null) {
      const category = await tx.role.findFirst({
        where: {
          id: input.categoryId,
          institutionId,
          roleHierarchyId: CATEGORY_LEVEL,
          code: { not: null },
        },
      });

      if (!category) {
        throw new Error('Invalid category');
      }
    }

    // Prevent duplicate code on update
    if (input.code) {
      const exists = await tx.role.findFirst({
        where: {
          institutionId,
          roleHierarchyId: DEPARTMENT_LEVEL,
          code: input.code,
          id: { not: departmentId },
        },
      });

      if (exists) {
        throw new Error('Department code already exists');
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

    // Update HOD
    if (input.hodUserId !== undefined) {
      await tx.userRole.deleteMany({
        where: { roleId: departmentId },
      });

      if (input.hodUserId !== null) {
        const hod = await tx.user.findFirst({
          where: {
            id: BigInt(input.hodUserId),
            institutionId,
          },
        });

        if (!hod) {
          throw new Error('Invalid HOD user');
        }

        await tx.userRole.create({
          data: {
            roleId: departmentId,
            userId: BigInt(input.hodUserId),
          },
        });
      }
    }

    return updated;
  });
}
