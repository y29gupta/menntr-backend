// src/controllers/category.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateCategorySchema,
  UpdateCategorySchema,
} from '../schemas/category.zod';
import {
  getCategories,
  createCategory,
  updateCategory,
  getCategoryMeta,
  getCategoryByIdService,
  deleteCategory as deleteCategoryService,
} from '../services/category.service';
import { Serializer } from '../utils/serializers';
import { ValidationError, ForbiddenError } from '../utils/errors';

export async function listCategories(req: FastifyRequest, reply: FastifyReply) {
  const prisma = req.prisma;
  const user_id = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const categories = await getCategories(prisma, user.institution_id);

  reply.send(
    categories.map((c: any) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      departmentCount: c._count.children,
      // Return all users assigned to this category (from user_roles table)
      assignedUsers: c.user_roles.map((ur: any) => ({
        id: Serializer.bigIntToString(ur.user.id),
        name: `${ur.user.first_name ?? ''} ${ur.user.last_name ?? ''}`.trim(),
        email: ur.user.email,
      })),
      // For backward compatibility, keep head as first user or null
      head: c.user_roles.length
        ? {
            id: Serializer.bigIntToString(c.user_roles[0].user.id),
            name: `${c.user_roles[0].user.first_name ?? ''} ${
              c.user_roles[0].user.last_name ?? ''
            }`.trim(),
            email: c.user_roles[0].user.email,
          }
        : null,
    }))
  );
}




export async function addCategory(req: FastifyRequest, reply: FastifyReply) {
  const parsed = CreateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const prisma = req.prisma;
  const user_id = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) throw new ForbiddenError('No institution');

  const category = await createCategory(
    prisma,
    user.institution_id,
    parsed.data
  );

  reply.code(201).send(category);
}

export async function editCategory(req: FastifyRequest, reply: FastifyReply) {
  const parsed = UpdateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const prisma = req.prisma;
  const categoryId = Number((req.params as any).id);
  const user_id = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) throw new ForbiddenError('No institution');

  const updated = await updateCategory(
    prisma,
    categoryId,
    user.institution_id,
    parsed.data
  );

  reply.send(updated);
}

export async function categoryMeta(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = req.prisma;

  const authUser = (req as any).user;
  if (!authUser?.sub) {
    throw new ForbiddenError('Unauthorized');
  }

  const user_id = BigInt(authUser.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: {
      institution_id: true,
      user_roles: { include: { role: true } },
    },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  // 🔐 Optional role protection (recommended)
  const allowed = user.user_roles.some((r: any) =>
    ['Institution Admin', 'Category Admin'].includes(r.role.name)
  );

  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions');
  }

  // ✅ Service already returns safe, serialized data
  const meta = await getCategoryMeta(prisma, user.institution_id);

  reply.send(meta);
}

export async function getCategoryById(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = req.prisma;
  const categoryId = Number((req.params as any).id);
  const user_id = BigInt((req as any).user.sub);

  if (Number.isNaN(categoryId)) {
    throw new ValidationError('Invalid category id');
  }

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const category = await getCategoryByIdService(
    prisma,
    categoryId,
    user.institution_id
  );

  // Get program for this category
  const program = await prisma.role_programs.findFirst({
    where: {
      category_role_id: categoryId,
      active: true,
    },
    select: {
      id: true,
      program_code: true,
      program_name: true,
    },
  });

  reply.send({
    id: category.id,
    name: category.name,
    code: category.code,

    head: category.user_roles.length
      ? {
          id: Serializer.bigIntToString(category.user_roles[0].user.id),
          name: `${category.user_roles[0].user.first_name ?? ''} ${
            category.user_roles[0].user.last_name ?? ''
          }`.trim(),
          email: category.user_roles[0].user.email,
        }
      : null,

    departments: category.children.map((d: any) => ({
      id: d.id,
      name: d.name,
      code: d.code,
    })),

    program: program
      ? {
          program_code: program.program_code,
          program_name: program.program_name,
        }
      : null,
  });
}



export async function deleteCategory(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = req.prisma;
  const categoryId = Number((req.params as any).id);
  const user_id = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: {
      institution_id: true,
      user_roles: { include: { role: true } },
    },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  // 🔐 Only Institution / Category Admin
  const allowed = user.user_roles.some((r: any) =>
    ['Institution Admin', 'Category Admin'].includes(r.role.name)
  );

  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions');
  }

  await deleteCategoryService(
    prisma,
    categoryId,
    user.institution_id
  );

  reply.send({ message: 'Category deleted successfully' });
}
