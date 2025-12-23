import { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../utils/errors';

export function ensureViewOnly(request: FastifyRequest, reply: FastifyReply) {
  const user = (request as any).user;

  if (user?.roles?.includes('Procurement')) {
    // Only allow GET requests for Procurement role
    if (request.method !== 'GET') {
      throw new ForbiddenError('Procurement role has view-only access');
    }
  }
}
