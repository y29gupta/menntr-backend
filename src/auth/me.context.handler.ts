import { FastifyRequest, FastifyReply } from 'fastify';
import { resolveAccessContext } from './permission.resolver';
import { Serializer } from '../../src/utils/serializers';

export async function meContextHandler(request: FastifyRequest, reply: FastifyReply) {
  const prisma = request.prisma;
  const userJwt = request.user;

  if (!userJwt) {
    return reply.code(401).send({ message: 'Unauthorized' });
  }

  const userId = BigInt(userJwt.sub);
  const institutionId = userJwt.institution_id;

  /**
   * 1. Fetch user
   */
  const user = await prisma.users.findUnique({
    where: { id: userId },
    include: {
      user_roles: {
        include: {
          role: {
            include: {
              hierarchy: true,
            },
          },
        },
      },
      institution: {
        include: {
          plan: true,
        },
      },
    },
  });

  if (!user || user.status !== 'active') {
    return reply.code(401).send({ message: 'User inactive' });
  }

  /**
   * 2. Resolve access context (fresh)
   */
  const accessContext = await resolveAccessContext(prisma, userId, institutionId);

  /**
   * 3. Prepare response
   */
  return reply.send({
    user: {
      id: Serializer.bigIntToString(user.id),
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
    },

    institution: user.institution
      ? {
          id: user.institution.id,
          name: user.institution.name,
          code: user.institution.code,
        }
      : null,

    plan: {
      code: accessContext.plan_code,
    },

    roles: Serializer.serializeRoles(user),

    permissions: accessContext.permissions,

    modules: accessContext.modules,
  });
}
