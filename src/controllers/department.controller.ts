import { FastifyRequest, FastifyReply } from 'fastify';
import { CreateDepartmentSchema, UpdateDepartmentSchema } from '../schemas/department.zod';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  getDepartmentMeta,
  deleteDepartment as deleteDepartmentService,
  DEPARTMENT_LEVEL,
  CATEGORY_LEVEL,
} from '../services/department.service';
import { Serializer } from '../utils/serializers';
import { ValidationError, ForbiddenError } from '../utils/errors';

export async function listDepartments(request: FastifyRequest, reply: FastifyReply) {
  const prisma = request.prisma;
  const user_id = BigInt((request as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const {
    page = 1,
    limit = 10,
    search = '',
    departments,
    categories,
    hods,
    sort = 'newest',
  } = request.query as any;

  // normalize arrays inside controller
  const deptArray = departments ? (Array.isArray(departments) ? departments : [departments]) : [];

  const categoryArray = categories ? (Array.isArray(categories) ? categories : [categories]) : [];

  const hodArray = hods ? (Array.isArray(hods) ? hods : [hods]) : [];

  const result = await getDepartments(prisma, {
    institution_id: user.institution_id,
    page: Number(page),
    limit: Number(limit),
    search,
    departments: deptArray,
    categories: categoryArray,
    hods: hodArray,
    sort,
  });

  const data = result.data.map((r: any) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    category: r.parent ? { id: r.parent.id, name: r.parent.name } : null,
    assignedUsers: r.user_roles.map((ur: any) => ({
      id: Serializer.bigIntToString(ur.user.id),
      name: `${ur.user.first_name ?? ''} ${ur.user.last_name ?? ''}`.trim(),
      email: ur.user.email,
    })),
    hod: r.user_roles.length
      ? {
          id: Serializer.bigIntToString(r.user_roles[0].user.id),
          name: `${r.user_roles[0].user.first_name ?? ''} ${
            r.user_roles[0].user.last_name ?? ''
          }`.trim(),
          email: r.user_roles[0].user.email,
        }
      : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  // ✅ DO NOT CHANGE RESPONSE SHAPE
  reply.send({
    data,
    ...result.meta,
  });
}

export async function getDistinctDepartments(request: FastifyRequest, reply: FastifyReply) {
  const prisma = request.prisma;
  const user_id = BigInt((request as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const departments = await prisma.roles.findMany({
    where: {
      institution_id: user.institution_id,
      role_hierarchy_id: DEPARTMENT_LEVEL,
      is_system_role: false,
    },
    select: { name: true },
    distinct: ['name'],
    orderBy: { name: 'asc' },
  });

  reply.send({
    data: departments.map((d: any) => d.name),
  });
}

export async function getDistinctCategories(request: FastifyRequest, reply: FastifyReply) {
  const prisma = request.prisma;
  const user_id = BigInt((request as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const categories = await prisma.roles.findMany({
    where: {
      institution_id: user.institution_id,
      role_hierarchy_id: CATEGORY_LEVEL,
      is_system_role: false,
    },
    select: { name: true },
    distinct: ['name'],
    orderBy: { name: 'asc' },
  });

  reply.send({
    data: categories.map((c: any) => c.name),
  });
}

export async function getDistinctHods(request: FastifyRequest, reply: FastifyReply) {
  const prisma = request.prisma;
  const user_id = BigInt((request as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const hods = await prisma.user_roles.findMany({
    where: {
      role: {
        institution_id: user.institution_id,
        role_hierarchy_id: DEPARTMENT_LEVEL,
      },
    },
    include: { user: true },
  });

  const distinct = Array.from(
    new Map(
      hods.map((h: any) => [
        h.user.id.toString(),
        {
          id: h.user.id.toString(),
          name: `${h.user.first_name ?? ''} ${h.user.last_name ?? ''}`.trim(),
          email: h.user.email,
        },
      ])
    ).values()
  );

  reply.send({
    data: distinct,
  });
}

export async function addDepartment(request: FastifyRequest, reply: FastifyReply) {
  const parsed = CreateDepartmentSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const prisma = request.prisma;
  const user_id = BigInt((request as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const department = await createDepartment(prisma, user.institution_id, parsed.data);

  reply.code(201).send(department);
}

export async function editDepartment(request: FastifyRequest, reply: FastifyReply) {
  const parsed = UpdateDepartmentSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const prisma = request.prisma;
  const department_id = Number((request.params as any).id);
  const user_id = BigInt((request as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const updated = await updateDepartment(prisma, department_id, user.institution_id, parsed.data);

  reply.send(updated);
}

export async function departmentMeta(req: FastifyRequest, reply: FastifyReply) {
  const prisma = req.prisma;
  const authUser = (req as any).user;

  if (!authUser?.sub) {
    throw new ForbiddenError('Unauthorized');
  }

  const user_id = BigInt(authUser.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: {
      institution_id: true,
      user_roles: { include: { role: true } },
    },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  // 🔐 Only admins can assign HOD
  const allowed = user.user_roles.some((r: any) =>
    ['Institution Admin', 'Category Admin'].includes(r.role.name)
  );

  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions');
  }

  const meta = await getDepartmentMeta(prisma, user.institution_id);
  reply.send(meta);
}

export async function deleteDepartment(request: FastifyRequest, reply: FastifyReply) {
  const prisma = request.prisma;
  const department_id = Number((request.params as any).id);
  const user_id = BigInt((request as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: {
      institution_id: true,
      user_roles: { include: { role: true } },
    },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  // 🔐 Only admins can delete
  const allowed = user.user_roles.some((r: any) =>
    ['Institution Admin', 'Category Admin'].includes(r.role.name)
  );

  if (!allowed) {
    throw new ForbiddenError('Insufficient permissions');
  }

  await deleteDepartmentService(prisma, department_id, user.institution_id);

  reply.send({ message: 'Department deleted successfully' });
}
