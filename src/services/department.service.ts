import { PrismaClient } from '@prisma/client';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors';


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
    // 1️⃣ Validate category (if provided)
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
        throw new ForbiddenError('Invalid category selected');
      }
    }

    // 2️⃣ Prevent duplicate department code
    const exists = await tx.role.findFirst({
      where: {
        institutionId,
        roleHierarchyId: DEPARTMENT_LEVEL,
        isSystemRole: false,
        code: input.code,
      },
    });

    if (exists) {
      throw new ConflictError('Department code already exists');
    }

    // 3️⃣ Create department
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

    // 4️⃣ Assign HOD
    if (input.hodUserId !== undefined) {
      const hod = await tx.user.findFirst({
        where: {
          id: BigInt(input.hodUserId),
          institutionId,
        },
      });

      if (!hod) {
        throw new ForbiddenError('Invalid HOD user');
      }
      const existingHod = await tx.userRole.findFirst({
        where: {
          userId: BigInt(input.hodUserId),
          role: {
            institutionId,
            roleHierarchyId: DEPARTMENT_LEVEL,
            isSystemRole: false,
          },
        },
      });

      if (existingHod) {
        throw new ConflictError('User is already assigned as HOD to another department');
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
    // 1️⃣ Ensure department exists
    const department = await tx.role.findFirst({
      where: {
        id: departmentId,
        institutionId,
        roleHierarchyId: DEPARTMENT_LEVEL,
        isSystemRole: false,
      },
    });

    if (!department) {
      throw new NotFoundError('Department not found');
    }

    // 2️⃣ Validate category
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
        throw new ForbiddenError('Invalid category selected');
      }
    }

    // 3️⃣ Prevent duplicate code
    if (input.code) {
      const exists = await tx.role.findFirst({
        where: {
          institutionId,
          roleHierarchyId: DEPARTMENT_LEVEL,
          isSystemRole: false,
          code: input.code,
          id: { not: departmentId },
        },
      });

      if (exists) {
        throw new ConflictError('Department code already exists');
      }
    }

    // 4️⃣ Update department
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

    // 5️⃣ Update HOD
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
          throw new ForbiddenError('Invalid HOD user');
        }

        const existingHod = await tx.userRole.findFirst({
          where: {
            userId: BigInt(input.hodUserId),
            role: {
              institutionId,
              roleHierarchyId: DEPARTMENT_LEVEL,
              isSystemRole: false,
              id: {not: departmentId},
            },
          },
        });

        if(existingHod) {
          throw new ConflictError('User is already assigned as HOD to another department');
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


export async function getDepartmentMeta(
  prisma: PrismaClient,
  institutionId: number
) {
  const [categories, hodUsers] = await Promise.all([
    // ✅ Parent Categories
    prisma.role.findMany({
      where: {
        institutionId,
        roleHierarchyId: CATEGORY_LEVEL,
        isSystemRole: false,
        code: { not: null },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    }),

    // ✅ ONLY users who HAVE the HOD role
    prisma.userRole.findMany({
      where: {
        role: {
          name: 'Department Admin',
          institutionId,
        },
      },
      select: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        user: { firstName: 'asc' },
      },
    }),
  ]);

  return {
    categories: categories.map((c) => ({
      id: c.id.toString(),
      name: c.name,
    })),

    hodUsers: hodUsers.map((ur) => ({
      id: ur.user.id.toString(),
      name: `${ur.user.firstName ?? ''} ${ur.user.lastName ?? ''}`.trim(),
      email: ur.user.email,
    })),
  };
}

