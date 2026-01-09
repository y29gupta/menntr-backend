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
  institution_id: number
) {
  return prisma.roles.findMany({
    where: {
      institution_id:institution_id,
      role_hierarchy_id: CATEGORY_LEVEL,
      code: { not: null },
    },
    include: {
      _count: {
        select: {
          children: {
            where: {
              role_hierarchy_id: DEPARTMENT_LEVEL,
              code: { not: null },
            },
          },
        },
      },
      user_roles: {
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
  institution_id: number
) {
  const [users, departments] = await Promise.all([
    prisma.users.findMany({
      where: { institution_id:institution_id, },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
      },
      orderBy: { first_name: 'asc' },
    }),

    prisma.roles.findMany({
      where: {
        institution_id:institution_id,
        role_hierarchy_id: DEPARTMENT_LEVEL,
        code: { not: null },        // ✅ real departments only
        is_system_role: false,        // ✅ exclude system roles
      },
      select: {
        id: true,
        name: true,
        parent_id: true,             // categoryId (nullable)
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  return {
    users: users.map((u:any) => ({
      id: u.id.toString(),
      name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
      email: u.email,
    })),

    departments: departments.map((d:any) => ({
      id: d.id.toString(),
      name: d.name,
      categoryId: d.partent_id ? d.partent_id.toString() : null,
      isAssigned: Boolean(d.partent_id), // 🔥 useful for UI
    })),
  };
}



export async function createCategory(
  prisma: PrismaClient,
  institution_id: number,
  input: {
    name: string;
    code: string;
    headUserId: number;
    departmentIds: number[];
  }
) {
  return prisma.$transaction(async (tx) => {
    // 1️⃣ Root role check
    const root = await tx.roles.findFirst({
      where: {
        institution_id:institution_id,
        role_hierarchy_id: ROOT_LEVEL,
      },
    });

    if (!root) {
      throw new NotFoundError('Institution root role not found');
    }

    // 2️⃣ Prevent duplicate category code
    const existing = await tx.roles.findFirst({
      where: {
        institution_id:institution_id,
        role_hierarchy_id: CATEGORY_LEVEL,
        code: input.code,
      },
    });

    if (existing) {
      throw new ConflictError('Category code already exists');
    }

    // 3️⃣ Validate category head user
    const headUser = await tx.users.findFirst({
      where: {
        id: BigInt(input.headUserId),
        institution_id:institution_id,
      },
    });

    if (!headUser) {
      throw new ForbiddenError('Invalid category head user');
    }

    // 4️⃣ Create category
    const category = await tx.roles.create({
      data: {
        name: input.name,
        code: input.code,
        institution_id:institution_id,
        parent_id: root.id,
        role_hierarchy_id: CATEGORY_LEVEL,
      },
    });

    // 5️⃣ Assign category head
    await tx.user_roles.create({
      data: {
        role_id: category.id,
        user_id: BigInt(input.headUserId),
      },
    });

    // 6️⃣ Assign departments (validated)
    if (input.departmentIds.length) {
      const validDepartments = await tx.roles.count({
        where: {
          id: { in: input.departmentIds },
          institution_id:institution_id,
          role_hierarchy_id: DEPARTMENT_LEVEL,
        },
      });

      if (validDepartments !== input.departmentIds.length) {
        throw new ForbiddenError(
          'One or more departments are invalid or belong to another institution'
        );
      }

      await tx.roles.updateMany({
        where: { id: { in: input.departmentIds } },
        data: { parent_id: category.id },
      });
    }

    return category;
  });
}


export async function updateCategory(
  prisma: PrismaClient,
  categoryId: number,
  institution_id: number,
  input: {
    name?: string;
    code?: string;
    headUserId?: number;
    departmentIds?: number[];
  }
) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.roles.findFirst({
      where: {
        id: categoryId,
        institution_id:institution_id,
        role_hierarchy_id: CATEGORY_LEVEL,
      },
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    // Prevent duplicate code
    if (input.code) {
      const exists = await tx.roles.findFirst({
        where: {
          institution_id:institution_id,
          role_hierarchy_id: CATEGORY_LEVEL,
          code: input.code,
          id: { not: categoryId },
        },
      });

      if (exists) {
        throw new ConflictError('Category code already exists');
      }
    }

    const updated = await tx.roles.update({
      where: { id: categoryId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.code && { code: input.code }),
      },
    });

    // Update head
    if (input.headUserId !== undefined) {
      const headUser = await tx.users.findFirst({
        where: {
          id: BigInt(input.headUserId),
          institution_id:institution_id,
        },
      });

      if (!headUser) {
        throw new ForbiddenError('Invalid category head user');
      }

      await tx.user_roles.deleteMany({ where: { role_id: categoryId } });
      await tx.user_roles.create({
        data: {
          role_id: categoryId,
          user_id: BigInt(input.headUserId),
        },
      });
    }

    // Update departments
    if (input.departmentIds) {
      await tx.roles.updateMany({
        where: {
          parent_id: categoryId,
          role_hierarchy_id: DEPARTMENT_LEVEL,
        },
        data: { parent_id: null },
      });

      if (input.departmentIds.length) {
        const valid = await tx.roles.count({
          where: {
            id: { in: input.departmentIds },
            institution_id:institution_id,
            role_hierarchy_id: DEPARTMENT_LEVEL,
          },
        });

        if (valid !== input.departmentIds.length) {
          throw new ForbiddenError('Invalid departments selected');
        }

        await tx.roles.updateMany({
          where: { id: { in: input.departmentIds } },
          data: { parent_id: categoryId },
        });
      }
    }

    return updated;
  });
}

export async function getCategoryByIdService(
  prisma: PrismaClient,
  categoryId: number,
  institution_id: number
) {
  const category = await prisma.roles.findFirst({
    where: {
      id: categoryId,
      institution_id:institution_id,
      role_hierarchy_id: CATEGORY_LEVEL,
      code: { not: null },
    },
    include: {
      user_roles: {
        include: { user: true }, // category head
      },
      children: {
        where: {
          role_hierarchy_id: DEPARTMENT_LEVEL,
          code: { not: null },
        },
        orderBy: { name: 'asc' },
      },
    },
  });

  if (!category) {
    throw new Error('Category not found');
  }

  return category;
}

export async function deleteCategory(
  prisma: PrismaClient,
  categoryId: number,
  institution_id: number
) {
  return prisma.$transaction(async (tx) => {
    // 1️⃣ Ensure category exists
    const category = await tx.roles.findFirst({
      where: {
        id: categoryId,
        institution_id,
        role_hierarchy_id: CATEGORY_LEVEL,
        is_system_role: false,
      },
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    // 2️⃣ Detach all departments under this category
    await tx.roles.updateMany({
      where: {
        parent_id: categoryId,
        role_hierarchy_id: DEPARTMENT_LEVEL,
      },
      data: { parent_id: null },
    });

    // 3️⃣ Remove category head assignment
    await tx.user_roles.deleteMany({
      where: { role_id: categoryId },
    });

    // 4️⃣ Delete the category
    await tx.roles.delete({
      where: { id: categoryId },
    });

    return { success: true };
  });
}
