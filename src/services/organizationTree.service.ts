import { PrismaClient } from '@prisma/client';

const CATEGORY_LEVEL = 2;
const DEPARTMENT_LEVEL = 3;
const FACULTY_LEVEL = 4;
const STUDENT_LEVEL = 5;

export async function buildOrganizationTree(
  prisma: PrismaClient,
  institution_id: number
) {
  // Get root institution admin role with all users
  const rootRole = await prisma.roles.findFirst({
    where: {
      institution_id: institution_id,
      role_hierarchy_id: 1,
      is_system_role: false,
    },
    include: {
      user_roles: {
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
      },
    },
  });

  // Get all categories with their departments, faculty, and all users
  const categories = await prisma.roles.findMany({
    where: {
      institution_id: institution_id,
      role_hierarchy_id: CATEGORY_LEVEL,
      is_system_role: false,
    },
    include: {
      user_roles: {
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
      },
      children: {
        where: {
          role_hierarchy_id: DEPARTMENT_LEVEL,
          is_system_role: false,
        },
        include: {
          user_roles: {
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
          },
          children: {
            where: {
              role_hierarchy_id: FACULTY_LEVEL,
              is_system_role: false,
            },
            include: {
              user_roles: {
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
              },
            },
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  return {
    id: `institution-${institution_id}`,
    type: 'institution',
    name: rootRole?.name || 'Institution Admin',
    users: rootRole?.user_roles.map((ur: any) => ({
      id: ur.user.id.toString(),
      name: `${ur.user.first_name ?? ''} ${ur.user.last_name ?? ''}`.trim(),
      email: ur.user.email,
    })) || [],
    children: categories.map((cat: any) => ({
      id: `category-${cat.id}`,
      type: 'category',
      name: cat.name,
      users: cat.user_roles.map((ur: any) => ({
        id: ur.user.id.toString(),
        name: `${ur.user.first_name ?? ''} ${ur.user.last_name ?? ''}`.trim(),
        email: ur.user.email,
      })),
      children: cat.children.map((dept: any) => ({
        id: `department-${dept.id}`,
        type: 'department',
        name: dept.name,
        users: dept.user_roles.map((ur: any) => ({
          id: ur.user.id.toString(),
          name: `${ur.user.first_name ?? ''} ${ur.user.last_name ?? ''}`.trim(),
          email: ur.user.email,
        })),
        children: dept.children.map((faculty: any) => ({
          id: `faculty-${faculty.id}`,
          type: 'faculty',
          name: faculty.name,
          users: faculty.user_roles.map((ur: any) => ({
            id: ur.user.id.toString(),
            name: `${ur.user.first_name ?? ''} ${ur.user.last_name ?? ''}`.trim(),
            email: ur.user.email,
          })),
        })),
      })),
    })),
  };
}
