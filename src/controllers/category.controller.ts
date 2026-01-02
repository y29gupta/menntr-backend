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
} from '../services/category.service';
import { Serializer } from '../utils/serializers';
import { ValidationError, ForbiddenError } from '../utils/errors';

export async function listCategories(req: FastifyRequest, reply: FastifyReply) {
  const prisma = req.prisma;
  const userId = BigInt((req as any).user.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  if (!user?.institutionId) {
    throw new ForbiddenError('No institution linked');
  }

  const categories = await getCategories(prisma, user.institutionId);

reply.send(
  categories.map((c) => ({
    id: c.id,
    name: c.name,
    // code: c.code,
    // departmentCount: c._count.children, // ✅ HERE
    // head: c.users.length
    //   ? {
    //       id: Serializer.bigIntToString(c.users[0].user.id),
    //       name: `${c.users[0].user.firstName ?? ''} ${
    //         c.users[0].user.lastName ?? ''
    //       }`.trim(),
    //       email: c.users[0].user.email,
    //     }
    //   : null,
  }))
);
}




export async function addCategory(req: FastifyRequest, reply: FastifyReply) {
  const parsed = CreateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const prisma = req.prisma;
  const userId = BigInt((req as any).user.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  if (!user?.institutionId) throw new ForbiddenError('No institution');

  const category = await createCategory(
    prisma,
    user.institutionId,
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
  const userId = BigInt((req as any).user.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  if (!user?.institutionId) throw new ForbiddenError('No institution');

  const updated = await updateCategory(
    prisma,
    categoryId,
    user.institutionId,
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

  const userId = BigInt(authUser.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      institutionId: true,
      roles: { include: { role: true } },
    },
  });

  if (!user?.institutionId) {
    throw new ForbiddenError('No institution linked');
  }

  // 🔐 Optional role protection (recommended)
  const allowed = user.roles.some((r: any) =>
    ['Institution Admin', 'Category Admin'].includes(r.role.name)
  );

  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions');
  }

  // ✅ Service already returns safe, serialized data
  const meta = await getCategoryMeta(prisma, user.institutionId);

  reply.send(meta);
}

export async function getCategoryById(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = req.prisma;
  const categoryId = Number((req.params as any).id);
  const userId = BigInt((req as any).user.sub);

  if (Number.isNaN(categoryId)) {
    throw new ValidationError('Invalid category id');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  if (!user?.institutionId) {
    throw new ForbiddenError('No institution linked');
  }

  const category = await getCategoryByIdService(
    prisma,
    categoryId,
    user.institutionId
  );

  reply.send({
    id: category.id,
    name: category.name,
    // code: category.code,

    // head: category.users.length
    //   ? {
    //       id: Serializer.bigIntToString(category.users[0].user.id),
    //       name: `${category.users[0].user.firstName ?? ''} ${
    //         category.users[0].user.lastName ?? ''
    //       }`.trim(),
    //       email: category.users[0].user.email,
    //     }
    //   : null,

    // departments: category.children.map((d: any) => ({
    //   id: d.id,
    //   name: d.name,
    //   code: d.code,
    // })),
  });
}
