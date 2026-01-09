import { PrismaClient } from '@prisma/client';

const DEPARTMENT_LEVEL = 3;

export async function getUsersForManagement(
  prisma: PrismaClient,
  institution_id: number,
  page = 1,
  limit = 10,
  search = '',
  status?: string
) {
  const where: any = {
    institution_id,
    email: { contains: search, mode: 'insensitive' },
  };

  if (status) {
    where.status = status;
  }

  const [rows, total] = await Promise.all([
    prisma.users.findMany({
      where,
      include: {
        user_roles: {
          include: {
            role: {
              include: {
                parent: true, // category
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.users.count({ where }),
  ]);

  return { rows, total };
}
