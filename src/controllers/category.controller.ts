import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  getCategories,
  createCategory,
  updateCategory,
} from '../services/category.service';
import { Serializer } from '../utils/serializers';

const CategorySchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  headUserId: z.number(),
  departmentIds: z.array(z.number()).default([]),
});

export async function listCategories(req: FastifyRequest, reply: FastifyReply) {
  const prisma = req.prisma;
  const userId = BigInt((req as any).user.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  if (!user?.institutionId) {
    return reply.status(403).send({ message: 'No institution' });
  }

  const categories = await getCategories(prisma, user.institutionId);
  const safeResponse = categories.map((category) => ({
    ...category,
    id: category.id,
    users: category.users.map((ur) => ({
      ...ur,
      userId: Serializer.bigIntToString(ur.userId),
      user: {
        ...ur.user,
        id: Serializer.bigIntToString(ur.user.id),
      },
    })),
  }));

  reply.send(safeResponse);
}

export async function addCategory(req: FastifyRequest, reply: FastifyReply) {
  const parsed = CategorySchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send(parsed.error);
  }

  const prisma = req.prisma;
  const userId = BigInt((req as any).user.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  if (!user?.institutionId) {
    return reply.status(403).send({ message: 'No institution' });
  }

  const category = await createCategory(
    prisma,
    user.institutionId,
    parsed.data
  );

  reply.status(201).send(category);
}

export async function editCategory(req: FastifyRequest, reply: FastifyReply) {
  const parsed = CategorySchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send(parsed.error);
  }

  const categoryId = Number((req.params as any).id);
  const prisma = req.prisma;

  const userId = BigInt((req as any).user.sub);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  const updated = await updateCategory(
    prisma,
    categoryId,
    user!.institutionId!,
    parsed.data
  );

  reply.send(updated);
}
