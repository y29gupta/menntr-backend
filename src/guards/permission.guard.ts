import { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../utils/errors';

export function requirePermission(permission: string) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = (request as any).user;

    if (!user?.permissions?.includes(permission)) {
      throw new ForbiddenError('Insufficient permissions');
    }
  };
}
