// src/routes/admin.ts
import { FastifyInstance } from 'fastify';
import { createSuperAdmin } from '../controllers/admin.controller';

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.post('/admin/superadmin', createSuperAdmin);
}
