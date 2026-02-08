import { PrismaClient } from '@prisma/client';
import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors';


const CATEGORY_LEVEL = 2;
const DEPARTMENT_LEVEL = 3;
const ROOT_LEVEL = 1;

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


export async function getCategories(
  prisma: PrismaClient,
  institution_id: number
) {
  return prisma.roles.findMany({
      where: {
        institution_id: institution_id,
        role_hierarchy_id: CATEGORY_LEVEL,
        // Filter by role_hierarchy_id only - categories are identified by hierarchy level, not code
      },
    include: {
      _count: {
        select: {
          children: {
            where: {
              role_hierarchy_id: DEPARTMENT_LEVEL,
              // Filter by role_hierarchy_id only, not by code
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
        institution_id: institution_id,
        role_hierarchy_id: DEPARTMENT_LEVEL,
        is_system_role: false,        // ✅ exclude system roles
        // Filter by role_hierarchy_id only, not by code
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
      categoryId: d.parent_id ? d.parent_id.toString() : null,
      isAssigned: Boolean(d.parent_id), // 🔥 useful for UI
    })),
  };
}



export async function createCategory(
  prisma: PrismaClient,
  institution_id: number,
  input: {
    name: string;
    code: string;
    programs?: Array<{ program_code: string; program_name: string }>;
  }
) {
  return prisma.$transaction(async (tx) => {
    // 1️⃣ Root role check
    const root = await tx.roles.findFirst({
      where: {
        institution_id: institution_id,
        role_hierarchy_id: ROOT_LEVEL,
      },
    });

    if (!root) {
      throw new NotFoundError('Institution root role not found');
    }

    // 2️⃣ Prevent duplicate category code
    const existing = await tx.roles.findFirst({
      where: {
        institution_id: institution_id,
        role_hierarchy_id: CATEGORY_LEVEL,
        code: input.code,
      },
    });

    if (existing) {
      throw new ConflictError('Category code already exists');
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

    // 4️⃣ Create category
    const category = await tx.roles.create({
      data: {
        name: input.name,
        code: input.code,
        institution_id: institution_id,
        parent_id: root.id,
        role_hierarchy_id: CATEGORY_LEVEL,
      },
    });

    // 5️⃣ Assign permissions from plan_role_permissions
    await assignPermissionsToRole(tx, category.id, planCode, CATEGORY_LEVEL);

    // 6️⃣ Create program if provided (only one program per category)
    if (input.programs && input.programs.length > 0) {
      if (input.programs.length > 1) {
        throw new ConflictError('Each category can have only one program');
      }

      const program = input.programs[0];
      
      // Check if category already has a program (shouldn't happen for new category, but safety check)
      const existingProgram = await tx.role_programs.findFirst({
        where: {
          category_role_id: category.id,
          active: true,
        },
      });

      if (existingProgram) {
        throw new ConflictError('This category already has a program assigned. Each category can have only one program.');
      }

      // Check for duplicate program code within the same category
      const existingByCode = await tx.role_programs.findFirst({
        where: {
          category_role_id: category.id,
          program_code: program.program_code,
        },
      });

      if (!existingByCode) {
        await tx.role_programs.create({
          data: {
            category_role_id: category.id,
            program_code: program.program_code,
            program_name: program.program_name,
            updated_at: new Date(),
          },
        });
      }
    }

    // Note: Users can be assigned to this category later via user_roles table
    // Departments can be assigned to this category later by updating their parent_id

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
    programs?: Array<{ program_code: string; program_name: string }>;
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

    // Update category (role_hierarchy_id is NEVER changed - always level 2)
    const updated = await tx.roles.update({
      where: { id: categoryId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.code && { code: input.code }),
        // role_hierarchy_id is NOT updated - always remains CATEGORY_LEVEL (2)
      },
    });

    // Handle program updates
    if (input.programs !== undefined) {
      // Get existing program for this category
      const existingProgram = await tx.role_programs.findFirst({
        where: {
          category_role_id: categoryId,
          active: true,
        },
      });

      if (input.programs.length === 0) {
        // If empty array, delete existing program (if any)
        if (existingProgram) {
          await tx.role_programs.update({
            where: { id: existingProgram.id },
            data: {
              active: false,
              updated_at: new Date(),
            },
          });
        }
      } else if (input.programs.length === 1) {
        // If one program provided, update or create
        const newProgram = input.programs[0];

        if (existingProgram) {
          // Update existing program
          await tx.role_programs.update({
            where: { id: existingProgram.id },
            data: {
              program_code: newProgram.program_code,
              program_name: newProgram.program_name,
              updated_at: new Date(),
            },
          });
        } else {
          // Create new program
          await tx.role_programs.create({
            data: {
              category_role_id: categoryId,
              program_code: newProgram.program_code,
              program_name: newProgram.program_name,
              updated_at: new Date(),
            },
          });
        }
      }
      // If programs.length > 1, validation should have caught this at schema level
    }

    // Note: Users can be assigned/updated via user_roles table separately
    // Departments can be assigned/updated by changing their parent_id separately

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
      institution_id: institution_id,
      role_hierarchy_id: CATEGORY_LEVEL,
      // Filter by role_hierarchy_id only, not by code
    },
    include: {
      user_roles: {
        include: { user: true }, // category head
      },
      children: {
        where: {
          role_hierarchy_id: DEPARTMENT_LEVEL,
          // Filter by role_hierarchy_id only, not by code
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
