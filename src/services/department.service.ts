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
        roleHierarchyId: 3,
        isSystemRole: false, // ✅ exclude system roles
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
      where: {
        institutionId,
        roleHierarchyId: 3,
        isSystemRole: false, // ✅ count only real departments
      },
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
    // Validate category
    if (input.categoryId) {
      const category = await tx.role.findFirst({
        where: {
          id: input.categoryId,
          institutionId,
          roleHierarchyId: CATEGORY_LEVEL,
          isSystemRole: false,
        },
      });

      if (!category) {
        throw new Error('Invalid category');
      }
    }

    // Prevent duplicate code
    const exists = await tx.role.findFirst({
      where: {
        institutionId,
        roleHierarchyId: DEPARTMENT_LEVEL,
        isSystemRole: false,
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
        isSystemRole: false,
      },
    });

    if (input.hodUserId !== undefined) {
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
        isSystemRole: false,
      },
    });

    if (!department) {
      throw new Error('Department not found');
    }

    // ✅ 1️⃣ Prevent duplicate department code
    if (input.code) {
      const exists = await tx.role.findFirst({
        where: {
          institutionId,
          roleHierarchyId: DEPARTMENT_LEVEL,
          isSystemRole: false,
          code: input.code,
          id: { not: departmentId }, // 👈 exclude current department
        },
      });

      if (exists) {
        throw new Error('Department code already exists');
      }
    }

    // ✅ 2️⃣ Validate category if provided
    if (input.categoryId !== undefined && input.categoryId !== null) {
      const category = await tx.role.findFirst({
        where: {
          id: input.categoryId,
          institutionId,
          roleHierarchyId: CATEGORY_LEVEL,
          isSystemRole: false,
        },
      });

      if (!category) {
        throw new Error('Invalid category');
      }
    }

    // ✅ 3️⃣ Update department
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

    // ✅ 4️⃣ Update HOD
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


