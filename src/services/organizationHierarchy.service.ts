import { PrismaClient } from '@prisma/client';

const CATEGORY_LEVEL = 2;
const DEPARTMENT_LEVEL = 3;

export async function buildOrganizationHierarchy(
  prisma: PrismaClient,
  institution_id: number
) {
  const categories = await prisma.roles.findMany({
    where: {
      institution_id: institution_id,
      role_hierarchy_id: CATEGORY_LEVEL,
      code: { not: null },
    },
    select: {
      _count: {
        select: {
          children: {
            where: {
              role_hierarchy_id: DEPARTMENT_LEVEL,
              code: { not: null },
            },
          },
        },
      },
    },
    orderBy: { created_at: 'asc' },
  });

  // 🔹 ROOT
  const hierarchy = {
    institution: {
      name: 'Institution Admin',
      children: [] as any[],
    },
  };

  // 🟢 CASE 1: brand-new institution (no categories)
  if (categories.length === 0) {
    hierarchy.institution.children.push({
      name: 'Category',
      children: [{ name: 'Department' }],
    });
    return hierarchy;
  }

  // 🟢 CASE 2+: categories exist
  categories.forEach((cat: any) => {
    const departmentCount = cat._count.children;

    hierarchy.institution.children.push({
      name: 'Category',
      children:
        departmentCount > 0
          ? Array.from({ length: departmentCount }, () => ({
              name: 'Department',
            }))
          : [],
    });

  });

  return hierarchy;
}

