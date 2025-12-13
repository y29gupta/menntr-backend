// src/routes/institutions.ts
import { FastifyInstance } from 'fastify';
import { createInstitutionHandler } from '../controllers/institution.controller';

export default async function institutionRoutes(fastify: FastifyInstance) {
  fastify.post('/institutions', { preHandler: [fastify.authenticate] }, createInstitutionHandler);
}
