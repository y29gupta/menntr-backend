import { Prisma, PrismaClient } from '@prisma/client';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors';
import { buildPaginatedResponse, getPagination } from '../utils/pagination';


const DEPARTMENT_LEVEL = 3;
const CATEGORY_LEVEL = 2;

export interface CreateDepartmentInput {
  name: string;
  code: string;
  category_id?: number | null;
  hod_user_id?: number;
}

export interface UpdateDepartmentInput {
  name?: string;
  code?: string;
  category_id?: number | null;
  hod_user_id?: number | null;
}

export async function getDepartments(
  prisma: PrismaClient,
  params: {
    institution_id: number;
    page?: number;
    limit?: number;
    search?: string;
  }
) {
  const { page, limit, skip } = getPagination(params);

  const where = {
    institution_id: params.institution_id,
    role_hierarchy_id: DEPARTMENT_LEVEL,
    is_system_role: false,
    ...(params.search && {
      name: { contains: params.search, mode: Prisma.QueryMode.insensitive, },
    }),
  };

  const [rows, total] = await Promise.all([
    prisma.roles.findMany({
      where,
      include: {
        parent: true, // category
        user_roles: {
          include: { user: true }, // HOD
        },
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.roles.count({ where }),
  ]);

  return buildPaginatedResponse(rows, total, page, limit);
}






export async function createDepartment(
  prisma: PrismaClient,
  institution_id: number,
  input: CreateDepartmentInput
) {
  return prisma.$transaction(async (tx) => {
    // 1️⃣ Validate category (if provided)
    if (input.category_id !== undefined && input.category_id !== null) {
      const category = await tx.roles.findFirst({
        where: {
          id: input.category_id,
          institution_id,
          role_hierarchy_id: CATEGORY_LEVEL,
          is_system_role: false,
        },
      });

      if (!category) {
        throw new ForbiddenError('Invalid category selected');
      }
    }

    // 2️⃣ Prevent duplicate department code
    const exists = await tx.roles.findFirst({
      where: {
        institution_id,
        role_hierarchy_id: DEPARTMENT_LEVEL,
        is_system_role: false,
        code: input.code,
      },
    });

    if (exists) {
      throw new ConflictError('Department code already exists');
    }

    // 3️⃣ Create department
    const department = await tx.roles.create({
      data: {
        name: input.name,
        code: input.code,
        institution_id:institution_id,
        parent_id: input.category_id ?? null,
        role_hierarchy_id: DEPARTMENT_LEVEL,
        is_system_role: false,
      },
    });

    // 4️⃣ Assign HOD
    if (input.hod_user_id !== undefined) {
      const hod = await tx.users.findFirst({
        where: {
          id: BigInt(input.hod_user_id),
          institution_id,
        },
      });

      if (!hod) {
        throw new ForbiddenError('Invalid HOD user');
      }
      const existingHod = await tx.user_roles.findFirst({
        where: {
          user_id: BigInt(input.hod_user_id),
          role: {
            institution_id,
            role_hierarchy_id: DEPARTMENT_LEVEL,
            is_system_role: false,
          },
        },
      });

      if (existingHod) {
        throw new ConflictError('User is already assigned as HOD to another department');
      }

      await tx.user_roles.create({
        data: {
          role_id: department.id,
          user_id: BigInt(input.hod_user_id),
        },
      });
    }

    return department;
  });
}



export async function updateDepartment(
  prisma: PrismaClient,
  departmentId: number,
  institution_id: number,
  input: UpdateDepartmentInput
) {
  return prisma.$transaction(async (tx) => {
    // 1️⃣ Ensure department exists
    const department = await tx.roles.findFirst({
      where: {
        id: departmentId,
        institution_id,
        role_hierarchy_id: DEPARTMENT_LEVEL,
        is_system_role: false,
      },
    });

    if (!department) {
      throw new NotFoundError('Department not found');
    }

    // 2️⃣ Validate category
    if (input.category_id !== undefined && input.category_id !== null) {
      const category = await tx.roles.findFirst({
        where: {
          id: input.category_id,
          institution_id,
          role_hierarchy_id: CATEGORY_LEVEL,
          is_system_role: false,
        },
      });

      if (!category) {
        throw new ForbiddenError('Invalid category selected');
      }
    }

    // 3️⃣ Prevent duplicate code
    if (input.code) {
      const exists = await tx.roles.findFirst({
        where: {
          institution_id,
          role_hierarchy_id: DEPARTMENT_LEVEL,
          is_system_role: false,
          code: input.code,
          id: { not: departmentId },
        },
      });

      if (exists) {
        throw new ConflictError('Department code already exists');
      }
    }

    // 4️⃣ Update department
    const updated = await tx.roles.update({
      where: { id: departmentId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.code && { code: input.code }),
        ...(input.category_id !== undefined && {
          parentId: input.category_id,
        }),
      },
    });

    // 5️⃣ Update HOD
    if (input.hod_user_id !== undefined) {
      await tx.user_roles.deleteMany({
        where: { role_id: departmentId },
      });

      if (input.hod_user_id !== null) {
        const hod = await tx.users.findFirst({
          where: {
            id: BigInt(input.hod_user_id),
            institution_id,
          },
        });

        if (!hod) {
          throw new ForbiddenError('Invalid HOD user');
        }

        const existingHod = await tx.user_roles.findFirst({
          where: {
            user_id: BigInt(input.hod_user_id),
            role: {
              institution_id,
              role_hierarchy_id: DEPARTMENT_LEVEL,
              is_system_role: false,
              id: {not: departmentId},
            },
          },
        });

        if(existingHod) {
          throw new ConflictError('User is already assigned as HOD to another department');
        }
        await tx.user_roles.create({
          data: {
            role_id: departmentId,
            user_id: BigInt(input.hod_user_id),
          },
        });
      }
    }

    return updated;
  });
}


export async function getDepartmentMeta(
  prisma: PrismaClient,
  institution_id: number
) {
  const [categories, hodUsers] = await Promise.all([
    // ✅ Parent Categories
    prisma.roles.findMany({
      where: {
        institution_id,
        role_hierarchy_id: CATEGORY_LEVEL,
        is_system_role: false,
        code: { not: null },
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    }),

    // ✅ ONLY users who HAVE the HOD role
    prisma.user_roles.findMany({
      where: {
        role: {
          name: 'Institution Admin',
          institution_id,
        },
      },
      select: {
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
      orderBy: {
        user: { first_name: 'asc' },
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
      name: `${ur.user.first_name ?? ''} ${ur.user.last_name ?? ''}`.trim(),
      email: ur.user.email,
    })),
  };
}

export async function deleteDepartment(
  prisma: PrismaClient,
  departmentId: number,
  institution_id: number
) {
  return prisma.$transaction(async (tx) => {
    // 1️⃣ Ensure department exists
    const department = await tx.roles.findFirst({
      where: {
        id: departmentId,
        institution_id,
        role_hierarchy_id: DEPARTMENT_LEVEL,
        is_system_role: false,
      },
    });

    if (!department) {
      throw new NotFoundError('Department not found');
    }

    // 2️⃣ Remove all user assignments (HOD / others)
    await tx.user_roles.deleteMany({
      where: { role_id: departmentId },
    });

    // 3️⃣ Detach child roles (future-safe)
    await tx.roles.updateMany({
      where: { parent_id: departmentId },
      data: { parent_id: null },
    });

    // 4️⃣ Delete department
    await tx.roles.delete({
      where: { id: departmentId },
    });

    return { success: true };
  });
}
