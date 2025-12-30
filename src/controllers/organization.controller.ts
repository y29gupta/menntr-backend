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


const CATEGORY_LEVEL = 2;
const DEPARTMENT_LEVEL = 3;

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

  // Institution Admin (always one)
  const institution = await prisma.role.findFirst({
    where: {
      institutionId: user.institutionId,
      roleHierarchyId: 1,
    },
    select: { id: true, name: true },
  });

  if (!institution) {
    throw new Error('Institution Admin role missing');
  }

  // Fetch categories + departments
  const categories = await prisma.role.findMany({
    where: {
      institutionId: user.institutionId,
      roleHierarchyId: CATEGORY_LEVEL,
      code: { not: null },
    },
    include: {
      children: {
        where: {
          roleHierarchyId: DEPARTMENT_LEVEL,
          code: { not: null },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  // 🔹 If NO categories → return STATIC skeleton
  if (categories.length === 0) {
    return reply.send({
      institution: {
        id: institution.id,
        name: institution.name,
        children: [
          {
            id: null,
            name: 'Category',
            children: [
              {
                id: null,
                name: 'Department',
              },
            ],
          },
        ],
      },
    });
  }

  // 🔹 Categories exist → overlay real data
  return reply.send({
    institution: {
      id: institution.id,
      name: institution.name,
      children: categories.map((c:any) => ({
        id: c.id,
        name: c.name,
        children:
          c.children.length > 0
            ? c.children
            : [{ id: null, name: 'Department' }],
      })),
    },
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
