import { PrismaClient } from '@prisma/client';

const CATEGORY_LEVEL = 2;
const DEPARTMENT_LEVEL = 3;

export async function buildOrganizationTree(
  prisma: PrismaClient,
  institutionId: number
) {
  const categories = await prisma.role.findMany({
    where: {
      institutionId,
      roleHierarchyId: CATEGORY_LEVEL,
    //   code: { not: null },
    },
    include: {
      users: { include: { user: true } }, // category head
      children: {
        where: {
          roleHierarchyId: DEPARTMENT_LEVEL,
        //   code: { not: null },
        },
        include: {
          users: { include: { user: true } }, // HOD
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  return {
    id: `institution-${institutionId}`,
    type: 'institution',
    name: 'Institution Admin',
    children: categories.map((cat) => ({
      id: `category-${cat.id}`,
      type: 'category',
      name: cat.name,
      head: cat.users.length
        ? {
            id: cat.users[0].user.id.toString(),
            name: `${cat.users[0].user.firstName ?? ''} ${
              cat.users[0].user.lastName ?? ''
            }`.trim(),
            email: cat.users[0].user.email,
          }
        : null,
      children: cat.children.map((dept) => ({
        id: `department-${dept.id}`,
        type: 'department',
        name: dept.name,
        hod: dept.users.length
          ? {
              id: dept.users[0].user.id.toString(),
              name: `${dept.users[0].user.firstName ?? ''} ${
                dept.users[0].user.lastName ?? ''
              }`.trim(),
              email: dept.users[0].user.email,
            }
          : null,
      })),
    })),
  };
}
