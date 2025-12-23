import { FastifyInstance } from 'fastify';

export async function requestUserPlugin(fastify: FastifyInstance) {
  // Guard prevents redeclare (safe even in tests)
  if (!fastify.hasRequestDecorator('user')) {
    fastify.decorateRequest('user', undefined);
  }
}
