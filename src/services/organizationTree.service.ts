import { PrismaClient } from '@prisma/client';

const CATEGORY_LEVEL = 2;
const DEPARTMENT_LEVEL = 3;

export async function buildOrganizationTree(
  prisma: PrismaClient,
  institution_id: number
) {
  const categories = await prisma.roles.findMany({
    where: {
      institution_id: institution_id,
      role_hierarchy_id: CATEGORY_LEVEL,
      code: { not: null },
    },
    include: {
      user_roles: { include: { user: true } }, // category head
      children: {
        where: {
          role_hierarchy_id: DEPARTMENT_LEVEL,
          code: { not: null },
        },
        include: {
          user_roles: { include: { user: true } }, // HOD
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  return {
    id: `institution-${institution_id}`,
    type: 'institution',
    name: 'Institution Admin',
    children: categories.map((cat: any) => ({
      id: `category-${cat.id}`,
      type: 'category',
      name: cat.name,
      head: cat.user_roles.length
        ? {
            id: cat.user_roles[0].user.id.toString(),
            name: `${cat.user_roles[0].user.first_name ?? ''} ${
              cat.user_roles[0].user.last_name ?? ''
            }`.trim(),
            email: cat.user_roles[0].user.email,
          }
        : null,
      children: cat.children.map((dept: any) => ({
        id: `department-${dept.id}`,
        type: 'department',
        name: dept.name,
        hod: dept.user_roles.length
          ? {
              id: dept.user_roles[0].user.id.toString(),
              name: `${dept.user_roles[0].user.first_name ?? ''} ${
                dept.user_roles[0].user.last_name ?? ''
              }`.trim(),
              email: dept.user_roles[0].user.email,
            }
          : null,
      })),
    })),
  };
}
