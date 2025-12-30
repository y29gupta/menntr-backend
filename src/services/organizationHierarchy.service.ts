import { PrismaClient } from '@prisma/client';

const CATEGORY_LEVEL = 2;
const DEPARTMENT_LEVEL = 3;

export async function buildOrganizationHierarchy(
  prisma: PrismaClient,
  institutionId: number
) {
  const categories = await prisma.role.findMany({
    where: {
      institutionId,
      roleHierarchyId: CATEGORY_LEVEL,
      code: { not: null },
    },
    select: {
      _count: {
        select: {
          children: {
            where: {
              roleHierarchyId: DEPARTMENT_LEVEL,
              code: { not: null },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // BASE STRUCTURE
  const hierarchy: any = {
    institution: {
      name: 'Institution Admin',
      children: [],
    },
  };

  const categoryCount = categories.length;
  const hasCategory = categoryCount > 0;

  // 🟢 CASE: no category and no department
  if (!hasCategory) {
    hierarchy.institution.children.push({
      name: 'Category',
      children: [{ name: 'Department' }],
    });
    return hierarchy;
  }

  // 🟢 CATEGORY EXISTS
  categories.forEach((cat, index) => {
    const deptCount = cat._count.children;

    const categoryNode: any = {
      name: 'Category',
      children: [],
    };

    // BASE department
    if (deptCount === 0 && index === 0) {
      categoryNode.children.push({ name: 'Department' });
    }

    // REAL extra departments
    const extraDepartments = Math.max(0, deptCount - 1);
    for (let i = 0; i < extraDepartments; i++) {
      categoryNode.children.push({ name: 'Department' });
    }

    hierarchy.institution.children.push(categoryNode);
  });

  return hierarchy;
}
