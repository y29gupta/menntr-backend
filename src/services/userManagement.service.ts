import { PrismaClient } from '@prisma/client';
import { buildPaginatedResponse, getPagination } from '../utils/pagination';

export async function getUsersForManagement(
  prisma: PrismaClient,
  institution_id: number,
  page: number,
  limit: number,
  search?: string,
  status?: string
) {
  const { skip, limit: take } = getPagination({ page, limit });

  const where: any = {
    institution_id,
  };

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { first_name: { contains: search, mode: 'insensitive' } },
      { last_name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      {
        user_roles: {
          some: {
            role: {
              is_system_role: false,
              name: { contains: search, mode: 'insensitive' },
            },
          },
        },
      },
    ];
  }

const [rows, total] = await Promise.all([
  prisma.users.findMany({
    where,
    skip,
    take,
    include: {
      user_roles: {
          where: {
            role: { is_system_role: false },
          },
        include: {
          role: {
            select: {
              id: true,
              name: true,
              role_hierarchy_id: true,
            },
          },
        },
      },
    },
    orderBy: { created_at: 'desc' },
  }),
  prisma.users.count({ where }),
]);

  return { rows, total };
}

export async function getBatchesForFacultyAssignment(
  prisma: PrismaClient,
  institution_id: number
) {
  // Fetch all batches with their department and category info
  const batches = await prisma.batches.findMany({
    where: {
      institution_id: institution_id,
      is_active: true,
    },
    include: {
      department_role: {
        select: {
          id: true,
          name: true,
          parent_id: true,
        },
      },
      category_role: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      { department_role: { name: 'asc' } },
      { academic_year: 'desc' },
      { name: 'asc' },
    ],
  });

  // Group by department
  const departmentMap = new Map<number, any>();

  for (const batch of batches) {
    if (!batch.department_role) continue;

    const deptId = batch.department_role.id;

    if (!departmentMap.has(deptId)) {
      departmentMap.set(deptId, {
        id: deptId,
        name: batch.department_role.name,
        category: batch.category_role
          ? {
              id: batch.category_role.id,
              name: batch.category_role.name,
            }
          : null,
        batches: [],
      });
    }

    const department = departmentMap.get(deptId);
    department.batches.push({
      id: batch.id,
      name: batch.name,
      academic_year: batch.academic_year,
    });
  }

  return {
    departments: Array.from(departmentMap.values()),
  };
}
