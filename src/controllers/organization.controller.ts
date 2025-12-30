import { FastifyRequest, FastifyReply } from 'fastify';
import { buildTree } from '../utils/hierarchy.util';
import {
  AddCategoryBody,
  AddDepartmentBody,
  MoveNodeBody,
  MoveNodeParams,
  DeleteNodeParams,
} from '../types/hierarchy.types';


import { ForbiddenError } from '../utils/errors';

export async function getHierarchy(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = req.prisma;
  const userId = BigInt((req as any).user.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  if (!user?.institutionId) {
    throw new ForbiddenError('No institution linked');
  }

  // 1️⃣ Institution Admin (ROOT)
  const institutionAdmin = await prisma.role.findFirst({
    where: {
      institutionId: user.institutionId,
      roleHierarchyId: 1,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!institutionAdmin) {
    return reply.send({ institution: null, categories: [] });
  }

  // 2️⃣ Categories
  const categories = await prisma.role.findMany({
    where: {
      institutionId: user.institutionId,
      roleHierarchyId: 2,
      code: { not: null },
    },
    include: {
      children: {
        where: {
          roleHierarchyId: 3,
          code: { not: null },
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  reply.send({
    institution: {
      id: institutionAdmin.id,
      name: institutionAdmin.name,
    },
    categories: categories.map((c: any) => ({
      id: c.id,
      name: c.name,
      departments: c.children,
    })),
  });
}


export async function addCategory(
  req: FastifyRequest<{ Body: AddCategoryBody }>,
  reply: FastifyReply
) {
  const prisma = req.prisma;
  const userId = BigInt((req as any).user.sub);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { institutionId: true },
  });

  const root = await prisma.role.findFirst({
    where: {
      institutionId: user!.institutionId!,
      roleHierarchyId: 1,
    },
  });

  if (!root) {
    return reply.status(500).send({ message: 'Institution root role missing' });
  }

  const role = await prisma.role.create({
    data: {
      name: req.body.name,
      institutionId: user!.institutionId!,
      parentId: root.id,
      roleHierarchyId: 2,
    },
  });

  reply.status(201).send(role);
}

export async function addDepartment(
  req: FastifyRequest<{ Body: AddDepartmentBody }>,
  reply: FastifyReply
) {
  const prisma = req.prisma;

  const parent = await prisma.role.findUnique({
    where: { id: req.body.categoryRoleId },
  });

  if (!parent || parent.roleHierarchyId !== 2) {
    return reply.status(400).send({ message: 'Invalid category role' });
  }

  const role = await prisma.role.create({
    data: {
      name: req.body.name,
      institutionId: parent.institutionId!,
      parentId: parent.id,
      roleHierarchyId: 3,
    },
  });

  reply.status(201).send(role);
}

export async function moveNode(
  req: FastifyRequest<{ Params: MoveNodeParams; Body: MoveNodeBody }>,
  reply: FastifyReply
) {
  const prisma = req.prisma;

  await prisma.role.update({
    where: { id: Number(req.params.id) },
    data: { parentId: req.body.newParentId },
  });

  reply.send({ success: true });
}

export async function deleteNode(
  req: FastifyRequest<{ Params: DeleteNodeParams }>,
  reply: FastifyReply
) {
  const prisma = req.prisma;

  await prisma.role.delete({
    where: { id: Number(req.params.id) },
  });

  reply.status(204).send();
}
