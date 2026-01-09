import { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../utils/errors';
import { getUsersForManagement } from '../services/userManagement.service';
import { Serializer } from '../utils/serializers';

export async function listUsers(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = req.prisma;
  const user_id = BigInt((req as any).user.sub);

  const authUser = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!authUser?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const {
    page = 1,
    limit = 10,
    search = '',
    status,
  } = req.query as any;

  const { rows, total } = await getUsersForManagement(
    prisma,
    authUser.institution_id,
    Number(page),
    Number(limit),
    search,
    status
  );

  const data = rows.map((u: any) => {
    // pick primary role (non-system)
    const roleEntry = u.user_roles.find(
      (ur: any) => !ur.role.is_system_role
    );

    const role = roleEntry?.role ?? null;

    const department =
      role?.role_hierarchy_id === 3 ? role.name : null;

    return {
      id: u.id.toString(),
      name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
      email: u.email,
      role: role?.name ?? null,
      department,
      status: u.status,
      last_login_at: u.last_login_at,
    };
  });

  reply.send({
    total,
    page: Number(page),
    limit: Number(limit),
    data,
  });
}
