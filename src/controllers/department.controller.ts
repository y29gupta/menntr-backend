// src/controllers/department.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
} from '../schemas/department.schema';

const DEPARTMENT_LEVEL = 3;

export async function addDepartment(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const parsed = CreateDepartmentSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send(parsed.error);
  }

  const prisma = request.prisma;
  const authUser = (request as any).user;

  if (!authUser?.sub) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { id: BigInt(authUser.sub) },
    select: { institutionId: true },
  });

  if (!user?.institutionId) {
    return reply.status(403).send({ message: 'User not linked to institution' });
  }

  // Create Department Role
  const role = await prisma.role.create({
    data: {
      name: parsed.data.name,
      institutionId: user.institutionId,
      parentId: parsed.data.categoryRoleId,
      roleHierarchyId: DEPARTMENT_LEVEL,
    },
  });

  // Assign HOD
  if (parsed.data.hodUserId) {
    await prisma.userRole.create({
      data: {
        userId: BigInt(parsed.data.hodUserId),
        roleId: role.id,
      },
    });
  }

  return reply.status(201).send({
    id: role.id,
    name: role.name,
    categoryRoleId: role.parentId,
  });
}


export async function listDepartments(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = request.prisma;

  const authUser = (request as any).user;
  if (!authUser?.sub) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { id: BigInt(authUser.sub) },
    select: { institutionId: true },
  });

  if (!user?.institutionId) {
    return reply.status(403).send({ message: 'User not linked to institution' });
  }

  const institutionId = user.institutionId;
  const { page = 1, limit = 10, search = '' } = request.query as any;

  const [roles, total] = await Promise.all([
    prisma.role.findMany({
      where: {
        institutionId,
        roleHierarchyId: 3, // ✅ Department level
        name: { contains: search, mode: 'insensitive' },
      },
      include: {
        parent: true,
        users: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.role.count({
      where: {
        institutionId,
        roleHierarchyId: 3,
      },
    }),
  ]);

  const data = roles.map((r:any) => ({
    id: r.id,
    name: r.name,
    institutionId: r.institutionId,
    parent: r.parent
      ? { id: r.parent.id, name: r.parent.name }
      : null,
    users: r.users.map((ur:any) => ({
      id: ur.user.id.toString(),
      firstName: ur.user.firstName,
      lastName: ur.user.lastName,
      email: ur.user.email,
    })),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return reply.send({
    total,
    page,
    limit,
    data,
  });
}



export async function updateDepartment(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const parsed = UpdateDepartmentSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send(parsed.error);
  }

  const prisma = request.prisma;
  const authUser = (request as any).user;
  const { id } = request.params as { id: string };

  if (!authUser?.sub) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  const role = await prisma.role.update({
    where: { id: Number(id) },
    data: {
      name: parsed.data.name,
      parentId: parsed.data.categoryRoleId,
    },
  });

  // Update HOD (replace)
  if (parsed.data.hodUserId) {
    await prisma.userRole.deleteMany({
      where: { roleId: role.id },
    });

    await prisma.userRole.create({
      data: {
        userId: BigInt(parsed.data.hodUserId),
        roleId: role.id,
      },
    });
  }

  return reply.send({
    id: role.id,
    name: role.name,
    categoryRoleId: role.parentId,
  });
}
