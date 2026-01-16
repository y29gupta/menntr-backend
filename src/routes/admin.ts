import { FastifyInstance } from 'fastify';
import { createSuperAdmin } from '../controllers/admin.controller';

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/admin/superadmin',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 60 * 60 * 1000,
        },
      },
    },
    createSuperAdmin
  );
}
