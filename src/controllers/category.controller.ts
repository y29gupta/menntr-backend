import { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateCategorySchema,
  UpdateCategorySchema,
} from '../schemas/category.zod';
import {
  getCategories,
  createCategory,
  updateCategory,
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
      ...c,
      users: c.users.map((ur) => ({
        ...ur,
        userId: Serializer.bigIntToString(ur.userId),
        user: {
          ...ur.user,
          id: Serializer.bigIntToString(ur.user.id),
        },
      })),
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

  if (!user?.institutionId) {
    throw new ForbiddenError('No institution');
  }

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

  const categoryId = Number((req.params as any).id);
  const prisma = req.prisma;

  const userId = BigInt((req as any).user.sub);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  if (!user?.institutionId) {
    throw new ForbiddenError('No institution');
  }

  const updated = await updateCategory(
    prisma,
    categoryId,
    user.institutionId,
    parsed.data
  );

  reply.send(updated);
}

