import { Prisma, PrismaClient } from '@prisma/client';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
import { buildPaginatedResponse, getPagination } from '../utils/pagination';

export const DEPARTMENT_LEVEL = 3;
export const CATEGORY_LEVEL = 2;

// Helper function to assign permissions to a role based on plan and hierarchy
async function assignPermissionsToRole(
  tx: any,
  roleId: number,
  planCode: string | null,
  roleHierarchyId: number
) {
  if (!planCode) {
    // If no plan, skip permission assignment
    return;
  }

  // Get permissions from plan_role_permissions based on plan_code and role_hierarchy_id
  const planRolePermissions = await tx.plan_role_permissions.findMany({
    where: {
      plan_code: planCode,
      role_hierarchy_id: roleHierarchyId,
    },
    select: {
      permission_id: true,
    },
  });

  if (planRolePermissions.length > 0) {
    // Insert permissions into role_permissions table
    await tx.role_permissions.createMany({
      data: planRolePermissions.map((prp: any) => ({
        role_id: roleId,
        permission_id: prp.permission_id,
      })),
      skipDuplicates: true,
    });
  }
}

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
  // hod_user_id removed - users can be assigned via user_roles table
}

export async function getDepartments(
  prisma: PrismaClient,
  params: {
    institution_id: number;
    page?: number;
    limit?: number;
    search?: string;
    departments?: string[];
    categories?: string[];
    hods?: string[];
    sort?: 'a_z' | 'z_a' | 'newest' | 'oldest';
  }
) {
  const { page, limit, skip } = getPagination(params);

  const where: any = {
    institution_id: params.institution_id,
    role_hierarchy_id: DEPARTMENT_LEVEL,
    is_system_role: false,
  };

  /* ✅ CHECKBOX FILTERS */

  if (params.departments?.length) {
    where.name = {
      in: params.departments,
      mode: Prisma.QueryMode.insensitive,
    };
  }

  if (params.categories?.length) {
    where.parent = {
      name: {
        in: params.categories,
        mode: Prisma.QueryMode.insensitive,
      },
    };
  }

  if (params.hods?.length) {
    where.user_roles = {
      some: {
        user: {
          OR: params.hods.map((h: string) => ({
            OR: [
              { first_name: { contains: h, mode: 'insensitive' } },
              { last_name: { contains: h, mode: 'insensitive' } },
              { email: { contains: h, mode: 'insensitive' } },
            ],
          })),
        },
      },
    };
  }

  /* ✅ GLOBAL SEARCH */

  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { code: { contains: params.search, mode: 'insensitive' } },
      { parent: { name: { contains: params.search, mode: 'insensitive' } } },
      {
        user_roles: {
          some: {
            user: {
              OR: [
                { first_name: { contains: params.search, mode: 'insensitive' } },
                { last_name: { contains: params.search, mode: 'insensitive' } },
                { email: { contains: params.search, mode: 'insensitive' } },
              ],
            },
          },
        },
      },
    ];
  }

  /* ✅ SORTING (NO RESPONSE CHANGE) */

  let orderBy: any = { created_at: 'desc' };

  switch (params.sort) {
    case 'a_z':
      orderBy = { name: 'asc' };
      break;
    case 'z_a':
      orderBy = { name: 'desc' };
      break;
    case 'oldest':
      orderBy = { created_at: 'asc' };
      break;
    case 'newest':
    default:
      orderBy = { created_at: 'desc' };
  }

  const [rows, total] = await Promise.all([
    prisma.roles.findMany({
      where,
      skip,
      take: limit,
      include: {
        parent: true,
        user_roles: { include: { user: true } },
      },
      orderBy,
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

    // 3️⃣ Get institution plan code for permission assignment
    const institution = await tx.institutions.findUnique({
      where: { id: institution_id },
      select: {
        plan_id: true,
        plan: {
          select: {
            code: true,
          },
        },
      },
    });

    const planCode = institution?.plan?.code || null;

    // 4️⃣ Create department
    const department = await tx.roles.create({
      data: {
        name: input.name,
        code: input.code,
        institution_id: institution_id,
        parent_id: input.category_id ?? null,
        role_hierarchy_id: DEPARTMENT_LEVEL,
        is_system_role: false,
      },
    });

    // 5️⃣ Assign permissions from plan_role_permissions
    await assignPermissionsToRole(tx, department.id, planCode, DEPARTMENT_LEVEL);

    // Note: Users can be assigned to this department later via user_roles table

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

    // 4️⃣ Update department (role_hierarchy_id is NEVER changed - always level 3)
    const updated = await tx.roles.update({
      where: { id: departmentId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.code && { code: input.code }),
        ...(input.category_id !== undefined && {
          parent_id: input.category_id,
        }),
        // role_hierarchy_id is NOT updated - always remains DEPARTMENT_LEVEL (3)
      },
    });

    // Note: Users can be assigned/updated via user_roles table separately

    return updated;
  });
}

export async function getDepartmentMeta(prisma: PrismaClient, institution_id: number) {
  const [categories, hodUsers] = await Promise.all([
    // ✅ Parent Categories - Include all categories (even without codes) to show default engineering category
    prisma.roles.findMany({
      where: {
        institution_id,
        role_hierarchy_id: CATEGORY_LEVEL,
        is_system_role: false,
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
