import { PrismaClient } from '@prisma/client';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors';


const CATEGORY_LEVEL = 2;
const DEPARTMENT_LEVEL = 3;
const ROOT_LEVEL = 1;


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

  return {
    users: users.map((u) => ({
      id: u.id.toString(),
      name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
      email: u.email,
    })),
    departments,
  };
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
    // 1️⃣ Root role check
    const root = await tx.role.findFirst({
      where: {
        institutionId,
        roleHierarchyId: ROOT_LEVEL,
      },
    });

    if (!root) {
      throw new NotFoundError('Institution root role not found');
    }

    // 2️⃣ Prevent duplicate category code
    const existing = await tx.role.findFirst({
      where: {
        institutionId,
        roleHierarchyId: CATEGORY_LEVEL,
        code: input.code,
      },
    });

    if (existing) {
      throw new ConflictError('Category code already exists');
    }

    // 3️⃣ Validate category head user
    const headUser = await tx.user.findFirst({
      where: {
        id: BigInt(input.headUserId),
        institutionId,
      },
    });

    if (!headUser) {
      throw new ForbiddenError('Invalid category head user');
    }

    // 4️⃣ Create category
    const category = await tx.role.create({
      data: {
        name: input.name,
        code: input.code,
        institutionId,
        parentId: root.id,
        roleHierarchyId: CATEGORY_LEVEL,
      },
    });

    // 5️⃣ Assign category head
    await tx.userRole.create({
      data: {
        roleId: category.id,
        userId: BigInt(input.headUserId),
      },
    });

    // 6️⃣ Assign departments (validated)
    if (input.departmentIds.length) {
      const validDepartments = await tx.role.count({
        where: {
          id: { in: input.departmentIds },
          institutionId,
          roleHierarchyId: DEPARTMENT_LEVEL,
        },
      });

      if (validDepartments !== input.departmentIds.length) {
        throw new ForbiddenError(
          'One or more departments are invalid or belong to another institution'
        );
      }

      await tx.role.updateMany({
        where: { id: { in: input.departmentIds } },
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

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    // Prevent duplicate code
    if (input.code) {
      const exists = await tx.role.findFirst({
        where: {
          institutionId,
          roleHierarchyId: CATEGORY_LEVEL,
          code: input.code,
          id: { not: categoryId },
        },
      });

      if (exists) {
        throw new ConflictError('Category code already exists');
      }
    }

    const updated = await tx.role.update({
      where: { id: categoryId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.code && { code: input.code }),
      },
    });

    // Update head
    if (input.headUserId !== undefined) {
      const headUser = await tx.user.findFirst({
        where: {
          id: BigInt(input.headUserId),
          institutionId,
        },
      });

      if (!headUser) {
        throw new ForbiddenError('Invalid category head user');
      }

      await tx.userRole.deleteMany({ where: { roleId: categoryId } });
      await tx.userRole.create({
        data: {
          roleId: categoryId,
          userId: BigInt(input.headUserId),
        },
      });
    }

    // Update departments
    if (input.departmentIds) {
      await tx.role.updateMany({
        where: {
          parentId: categoryId,
          roleHierarchyId: DEPARTMENT_LEVEL,
        },
        data: { parentId: null },
      });

      if (input.departmentIds.length) {
        const valid = await tx.role.count({
          where: {
            id: { in: input.departmentIds },
            institutionId,
            roleHierarchyId: DEPARTMENT_LEVEL,
          },
        });

        if (valid !== input.departmentIds.length) {
          throw new ForbiddenError('Invalid departments selected');
        }

        await tx.role.updateMany({
          where: { id: { in: input.departmentIds } },
          data: { parentId: categoryId },
        });
      }
    }

    return updated;
  });
}

