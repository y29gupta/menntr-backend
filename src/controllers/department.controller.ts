import { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
} from '../schemas/department.zod';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
} from '../services/department.service';
import { ValidationError, ForbiddenError } from '../utils/errors';
import { Serializer } from '../utils/serializers';

export async function listDepartments(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = request.prisma;
  const userId = BigInt((request as any).user.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  if (!user?.institutionId) {
    throw new ForbiddenError('No institution linked');
  }

  const { page = 1, limit = 10, search = '' } = request.query as any;

  const { rows, total } = await getDepartments(
    prisma,
    user.institutionId,
    Number(page),
    Number(limit),
    search
  );

  reply.send({
    total,
    page: Number(page),
    limit: Number(limit),
    data: rows.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      category: d.parent
        ? { id: d.parent.id, name: d.parent.name }
        : null,
      hod:
        d.users.length > 0
          ? {
              id: Serializer.bigIntToString(d.users[0].user.id),
              name: `${d.users[0].user.firstName ?? ''} ${
                d.users[0].user.lastName ?? ''
              }`.trim(),
            }
          : null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
  });
}

export async function addDepartment(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const parsed = CreateDepartmentSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const prisma = request.prisma;
  const userId = BigInt((request as any).user.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  if (!user?.institutionId) {
    throw new ForbiddenError('No institution linked');
  }

  const department = await createDepartment(
    prisma,
    user.institutionId,
    parsed.data
  );

  reply.code(201).send(department);
}

export async function editDepartment(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const parsed = UpdateDepartmentSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const departmentId = Number((request.params as any).id);
  const prisma = request.prisma;
  const userId = BigInt((request as any).user.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  if (!user?.institutionId) {
    throw new ForbiddenError('No institution linked');
  }

  const updated = await updateDepartment(
    prisma,
    departmentId,
    user.institutionId,
    parsed.data
  );

  reply.send(updated);
}
