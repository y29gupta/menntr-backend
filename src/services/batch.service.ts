import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../utils/errors';
import { buildPaginatedResponse, getPagination } from '../utils/pagination';

export async function listBatches(
  prisma: PrismaClient,
  params: {
    institution_id: number;
    page?: number;
    limit?: number;
  }
) {
  const { page, limit, skip } = getPagination(params);

  const [rows, total] = await Promise.all([
    prisma.batches.findMany({
      where: { institution_id: params.institution_id },
      include: {
        category_role: true,
        department_role: true,
        coordinator: true,
        students: true,
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.batches.count({
      where: { institution_id: params.institution_id },
    }),
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

    // ✅ for now: all users
    prisma.users.findMany({
      where: { institution_id },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
      },
      orderBy: { first_name: 'asc' },
    }),
  ]);

  return {
    categories,
    departments,
    faculties: faculties.map(f => ({
      id: f.id.toString(),
      name: `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim(),
      email: f.email,
    })),
  };
}
