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
import { buildOrganizationHierarchy } from '../services/organizationHierarchy.service';
import { buildOrganizationTree } from '../services/organizationTree.service';


const CATEGORY_LEVEL = 2;
const DEPARTMENT_LEVEL = 3;

export async function getHierarchy(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = req.prisma;
  const user_id = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const hierarchy = await buildOrganizationHierarchy(
    prisma,
    user.institution_id
  );

  reply.send(hierarchy);
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


export async function getOrganizationTree(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = req.prisma;
  const user_id = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const tree = await buildOrganizationTree(
    prisma,
    user.institution_id
  );

  reply.send(tree);
}
