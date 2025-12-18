// src/routes/institutions.ts
import { FastifyInstance } from 'fastify';
import { createInstitutionAdminHandler, createInstitutionHandler } from '../controllers/institution.controller';

export default async function institutionRoutes(fastify: FastifyInstance) {
  fastify.post('/institution', createInstitutionHandler);
  fastify.post('/institutions/admin', createInstitutionAdminHandler);
}