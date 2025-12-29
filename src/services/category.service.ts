import { PrismaClient } from '@prisma/client';

export interface CreateCategoryInput {
  name: string;
  code: string;
  headUserId: number;
  departmentIds: number[];
}

/**
 * List categories for an institution
 */
export async function getCategories(
  prisma: PrismaClient,
  institutionId: number
) {
  return prisma.role.findMany({
    where: {
      institutionId,
      roleHierarchyId: 2, // Category Admin
    },
    include: {
      children: {
        where: { roleHierarchyId: 3 }, // Departments
        orderBy: { name: 'asc' },
      },
      users: {
        include: { user: true }, // Assigned category head
      },
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Create category
 */
export async function createCategory(
  prisma: PrismaClient,
  institutionId: number,
  input: CreateCategoryInput
) {
  // 1️⃣ Institution Admin root
  const root = await prisma.role.findFirst({
    where: {
      institutionId,
      roleHierarchyId: 1,
    },
  });

  if (!root) {
    throw new Error('Institution Admin role missing');
  }

  // 2️⃣ Create category role
  const category = await prisma.role.create({
    data: {
      name: input.name,
      code: input.code,
      institutionId,
      parentId: root.id,
      roleHierarchyId: 2,
    },
  });

  // 3️⃣ Assign category head
  await prisma.userRole.create({
    data: {
      userId: input.headUserId,
      roleId: category.id,
    },
  });

  // 4️⃣ Attach departments
  if (input.departmentIds.length) {
    await prisma.role.updateMany({
      where: {
        id: { in: input.departmentIds },
        institutionId,
        roleHierarchyId: 3,
      },
      data: {
        parentId: category.id,
      },
    });
  }

  return category;
}

/**
 * Update category
 */
export async function updateCategory(
  prisma: PrismaClient,
  categoryId: number,
  institutionId: number,
  input: CreateCategoryInput
) {
  // Update name + code
  const category = await prisma.role.update({
    where: { id: categoryId },
    data: {
      name: input.name,
      code: input.code,
    },
  });

  // Update head
  await prisma.userRole.deleteMany({
    where: { roleId: categoryId },
  });

  await prisma.userRole.create({
    data: {
      userId: input.headUserId,
      roleId: categoryId,
    },
  });

  // Update departments
  await prisma.role.updateMany({
    where: {
      parentId: categoryId,
      roleHierarchyId: 3,
    },
    data: { parentId: null },
  });

  if (input.departmentIds.length) {
    await prisma.role.updateMany({
      where: {
        id: { in: input.departmentIds },
        roleHierarchyId: 3,
        institutionId,
      },
      data: { parentId: categoryId },
    });
  }

  return category;
}
