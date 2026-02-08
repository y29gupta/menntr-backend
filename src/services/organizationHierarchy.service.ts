import { PrismaClient } from '@prisma/client';

const CATEGORY_LEVEL = 2;
const DEPARTMENT_LEVEL = 3;
const FACULTY_LEVEL = 4;

export async function buildOrganizationHierarchy(
  prisma: PrismaClient,
  institution_id: number
) {
  // Get root institution admin role
  const rootRole = await prisma.roles.findFirst({
    where: {
      institution_id: institution_id,
      role_hierarchy_id: 1,
      is_system_role: false,
    },
  });

  // Get all categories with their departments and faculty roles
  const categories = await prisma.roles.findMany({
    where: {
      institution_id: institution_id,
      role_hierarchy_id: CATEGORY_LEVEL,
      is_system_role: false,
    },
    include: {
      children: {
        where: {
          role_hierarchy_id: DEPARTMENT_LEVEL,
          is_system_role: false,
        },
        include: {
          children: {
            where: {
              role_hierarchy_id: FACULTY_LEVEL,
              is_system_role: false,
            },
            orderBy: { created_at: 'asc' },
          },
        },
        orderBy: { created_at: 'asc' },
      },
    },
    orderBy: { created_at: 'asc' },
  });

  // 🔹 ROOT
  const hierarchy = {
    institution: {
      id: rootRole?.id?.toString() || 'root',
      name: rootRole?.name || 'Institution Admin',
      roleHierarchyId: 1,
      children: [] as any[],
    },
  };

  // 🟢 CASE 1: brand-new institution (no categories)
  if (categories.length === 0) {
    return hierarchy;
  }

  // 🟢 CASE 2+: categories exist - return actual role data with faculty
  hierarchy.institution.children = categories.map((cat: any) => ({
    id: cat.id.toString(),
    name: cat.name,
    roleHierarchyId: CATEGORY_LEVEL,
    children: cat.children.map((dept: any) => ({
      id: dept.id.toString(),
      name: dept.name,
      roleHierarchyId: DEPARTMENT_LEVEL,
      children: dept.children.map((faculty: any) => ({
        id: faculty.id.toString(),
        name: faculty.name,
        roleHierarchyId: FACULTY_LEVEL,
        children: [],
      })),
    })),
  }));

  return hierarchy;
}

