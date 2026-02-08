import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../utils/errors';
import { buildPaginatedResponse, getPagination } from '../utils/pagination';

export async function listBatches(
  prisma: PrismaClient,
  params: {
    institution_id: number;
    page?: number;
    limit?: number;
    search?: string;

    // column filters
    name?: string;
    category?: string;
    department?: string;
    coordinator?: string;
    status?: boolean;
  }
) {
  const { page, limit, skip } = getPagination(params);

  /* ------------------------------------------------
     STATUS HANDLING (COLUMN > GLOBAL)
  ------------------------------------------------- */

  const normalizedSearch = params.search?.trim().toLowerCase();

  let statusFromSearch: boolean | undefined;
  if (normalizedSearch === 'active') statusFromSearch = true;
  if (normalizedSearch === 'inactive') statusFromSearch = false;

  const where: any = {
    institution_id: params.institution_id,
    AND: [],
  };

  /* ---------------- COLUMN FILTERS (PRIORITY) ---------------- */

  // column filter ALWAYS wins
  if (params.status !== undefined) {
    where.AND.push({ is_active: params.status });
  }
  // fallback to global search status
  else if (statusFromSearch !== undefined) {
    where.AND.push({ is_active: statusFromSearch });
  }

  if (params.name) {
    where.AND.push({
      name: { contains: params.name, mode: 'insensitive' },
    });
  }

  if (params.category) {
    where.AND.push({
      category_role: {
        name: { contains: params.category, mode: 'insensitive' },
      },
    });
  }

  if (params.department) {
    where.AND.push({
      department_role: {
        name: { contains: params.department, mode: 'insensitive' },
      },
    });
  }

  if (params.coordinator) {
    where.AND.push({
      coordinator: {
        OR: [
          { first_name: { contains: params.coordinator, mode: 'insensitive' } },
          { last_name: { contains: params.coordinator, mode: 'insensitive' } },
        ],
      },
    });
  }

  /* ---------------- GLOBAL SEARCH (TEXT ONLY) ---------------- */
  // 🚨 skip text OR if search was a status keyword
  if (params.search && statusFromSearch === undefined) {
    const search = params.search.trim();

    where.AND.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },

        {
          category_role: {
            name: { contains: search, mode: 'insensitive' },
          },
        },

        {
          department_role: {
            name: { contains: search, mode: 'insensitive' },
          },
        },

        {
          coordinator: {
            OR: [
              { first_name: { contains: search, mode: 'insensitive' } },
              { last_name: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ],
    });
  }

  // Prisma safety
  if (where.AND.length === 0) delete where.AND;

  const [rows, total] = await Promise.all([
    prisma.batches.findMany({
      where,
      skip,
      take: limit,
      include: {
        category_role: true,
        department_role: true,
        coordinator: true,
        students: true,
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.batches.count({ where }),
  ]);

  return buildPaginatedResponse(rows, total, page, limit);
}






export async function getBatchById(
  prisma: PrismaClient,
  id: number,
  institution_id: number
) {
  const batch = await prisma.batches.findFirst({
    where: { id, institution_id },
    include: {
      category_role: true,
      department_role: true,
      coordinator: true,
    },
  });

  if (!batch) throw new NotFoundError('Batch not found');
  return batch;
}

// export async function createBatch(
//   prisma: PrismaClient,
//   institution_id: number,
//   input: any
// ) {
//   const academicYear = new Date(input.startDate).getFullYear();

//   return prisma.batches.create({
//     data: {
//       // 🔐 Institution
//       institution: {
//         connect: { id: institution_id },
//       },

//       name: input.name,
//       code: input.code,

//       // 🔗 Category (optional)
//       ...(input.categoryRoleId && {
//         category_role: {
//           connect: { id: input.categoryRoleId },
//         },
//       }),

//       // 🔗 Department (REQUIRED)
//       department_role: {
//         connect: { id: input.departmentRoleId },
//       },

//       // 👤 Coordinator (optional)
//       ...(input.coordinatorId && {
//         coordinator: {
//           connect: { id: BigInt(input.coordinatorId) },
//         },
//       }),

//       academic_year: academicYear,
//       start_date: input.startDate,
//       end_date: input.endDate,

//       is_active: input.isActive,
//     },
//   });
// }

export async function createBatch(
  prisma: PrismaClient,
  institution_id: number,
  input: {
    name: string;
    code: string;
    categoryRoleId?: number;
    departmentRoleId: number;
    coordinatorId?: string;
    startDate?: string;
    endDate?: string;
    isActive: boolean;
    sections: string[];
  }
) {
  return prisma.$transaction(async (tx) => {
    const academicYear = input.startDate
      ? new Date(input.startDate).getFullYear()
      : new Date().getFullYear();

    const batch = await tx.batches.create({
      data: {
        institution: { connect: { id: institution_id } },
        name: input.name,
        code: input.code,
        academic_year: academicYear,
        start_date: input.startDate,
        end_date: input.endDate,
        is_active: input.isActive,

        ...(input.categoryRoleId && {
          category_role: { connect: { id: input.categoryRoleId } },
        }),

        department_role: {
          connect: { id: input.departmentRoleId },
        },

        ...(input.coordinatorId && {
          coordinator: { connect: { id: BigInt(input.coordinatorId) } },
        }),
      },
    });

    // ✅ Create sections
    await tx.batch_sections.createMany({
      data: input.sections.map((name, index) => ({
        batch_id: batch.id,
        name,
        sort_order: index,
      })),
    });

    return batch;
  });
}


// export async function updateBatch(
//   prisma: PrismaClient,
//   id: number,
//   institution_id: number,
//   input: any
// ) {
//   const batch = await prisma.batches.findFirst({
//     where: { id, institution_id },
//   });

//   if (!batch) throw new NotFoundError('Batch not found');

//   const academicYear = input.startDate
//     ? new Date(input.startDate).getFullYear()
//     : undefined;

//   return prisma.batches.update({
//     where: { id },
//     data: {
//       ...(input.name && { name: input.name }),
//       ...(input.code && { code: input.code }),

//       ...(input.categoryRoleId !== undefined && {
//         category_role: input.categoryRoleId
//           ? { connect: { id: input.categoryRoleId } }
//           : { disconnect: true },
//       }),

//       ...(input.departmentRoleId && {
//         department_role: {
//           connect: { id: input.departmentRoleId },
//         },
//       }),

//       ...(input.coordinatorId !== undefined && {
//         coordinator: input.coordinatorId
//           ? { connect: { id: BigInt(input.coordinatorId) } }
//           : { disconnect: true },
//       }),

//       ...(input.startDate && { start_date: input.startDate }),
//       ...(input.endDate && { end_date: input.endDate }),
//       ...(academicYear && { academic_year: academicYear }),

//       ...(input.isActive !== undefined && {
//         is_active: input.isActive,
//       }),
//     },
//   });
// }
export async function updateBatch(
  prisma: PrismaClient,
  batchId: number,
  institution_id: number,
  input: {
    name?: string;
    code?: string;
    categoryRoleId?: number | null;
    departmentRoleId?: number;
    coordinatorId?: string | null;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
    sections?: string[];
  }
) {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.batches.findFirst({
      where: { id: batchId, institution_id },
    });

    if (!batch) throw new Error('Batch not found');

    await tx.batches.update({
      where: { id: batchId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.code && { code: input.code }),
        ...(input.startDate && { start_date: input.startDate }),
        ...(input.endDate && { end_date: input.endDate }),
        ...(input.isActive !== undefined && { is_active: input.isActive }),

        ...(input.categoryRoleId !== undefined && {
          category_role: input.categoryRoleId
            ? { connect: { id: input.categoryRoleId } }
            : { disconnect: true },
        }),

        ...(input.departmentRoleId && {
          department_role: { connect: { id: input.departmentRoleId } },
        }),

        ...(input.coordinatorId !== undefined && {
          coordinator: input.coordinatorId
            ? { connect: { id: BigInt(input.coordinatorId) } }
            : { disconnect: true },
        }),
      },
    });

    // 🔥 Replace sections safely
    if (input.sections) {
      await tx.batch_sections.deleteMany({
        where: { batch_id: batchId },
      });

      await tx.batch_sections.createMany({
        data: input.sections.map((name, index) => ({
          batch_id: batchId,
          name,
          sort_order: index,
        })),
      });
    }

    return { success: true };
  });
}



export async function deleteBatch(
  prisma: PrismaClient,
  id: number,
  institution_id: number
) {
  const exists = await prisma.batches.findFirst({
    where: { id, institution_id },
  });

  if (!exists) throw new NotFoundError('Batch not found');

  await prisma.batches.delete({ where: { id } });
}

export async function getBatchMeta(
  prisma: PrismaClient,
  institution_id: number
) {
  const [categories, departments, faculties] = await Promise.all([
    prisma.roles.findMany({
      where: {
        institution_id,
        role_hierarchy_id: 2,
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),

    prisma.roles.findMany({
      where: {
        institution_id,
        role_hierarchy_id: 3,
      },
      select: { id: true, name: true, parent_id: true },
      orderBy: { name: 'asc' },
    }),

    // ✅ Get faculty roles (level 4) with their parent_id (department)
    prisma.roles.findMany({
      where: {
        institution_id,
        role_hierarchy_id: 4,
        is_system_role: false,
      },
      select: {
        id: true,
        name: true,
        parent_id: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  // ✅ Get users assigned to faculty roles, grouped by role
  const facultyRoles = await Promise.all(
    faculties.map(async (facultyRole: any) => {
      const users = await prisma.user_roles.findMany({
        where: {
          role_id: facultyRole.id,
        },
        include: {
          user: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      });

      return {
        roleId: facultyRole.id,
        roleName: facultyRole.name,
        parentId: facultyRole.parent_id,
        users: users.map((ur: any) => ({
          id: ur.user.id.toString(),
          name: `${ur.user.first_name ?? ''} ${ur.user.last_name ?? ''}`.trim(),
          email: ur.user.email,
        })),
      };
    })
  );

  return {
    categories,
    departments,
    facultyRoles, // Return faculty roles with users grouped by role
  };
}
