import { FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

export function authorize(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    const hasRole = allowedRoles.some((role) => user.roles.includes(role));

    if (!hasRole) {
      throw new ForbiddenError(`Requires one of: ${allowedRoles.join(', ')}`);
    }
  };
}
