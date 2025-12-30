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
      code: c.code,
      head: c.users[0]
        ? {
            id: Serializer.bigIntToString(c.users[0].user.id),
            name: `${c.users[0].user.firstName} ${c.users[0].user.lastName}`,
            email: c.users[0].user.email,
          }
        : null,
      departments: c.children.map((d) => ({
        id: d.id,
        name: d.name,
      })),
    }))
  );
}

export async function categoryMeta(req: FastifyRequest, reply: FastifyReply) {
  const prisma = req.prisma;
  const userId = BigInt((req as any).user.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  if (!user?.institutionId) {
    throw new ForbiddenError('No institution linked');
  }

  const meta = await getCategoryMeta(prisma, user.institutionId);
  reply.send(meta);
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
