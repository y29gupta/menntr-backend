import { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
} from '../schemas/department.zod';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  getDepartmentMeta,
} from '../services/department.service';
import { Serializer } from '../utils/serializers';
import { ValidationError, ForbiddenError } from '../utils/errors';

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

  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    // code: r.code,
    category: r.parent
      ? { id: r.parent.id, name: r.parent.name }
      : null,
    hod: r.users.length
      ? {
          id: Serializer.bigIntToString(r.users[0].user.id),
          name: `${r.users[0].user.firstName ?? ''} ${
            r.users[0].user.lastName ?? ''
          }`.trim(),
          email: r.users[0].user.email,
        }
      : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  reply.send({ total, page, limit, data });
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

  const prisma = request.prisma;
  const departmentId = Number((request.params as any).id);
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

export async function departmentMeta(
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

  // 🔐 Only admins can assign HOD
  const allowed = user.roles.some((r: any) =>
    ['Institution Admin', 'Category Admin'].includes(r.role.name)
  );

  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions');
  }

  const meta = await getDepartmentMeta(prisma, user.institutionId);
  reply.send(meta);
}

