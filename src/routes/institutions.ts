import { FastifyInstance } from 'fastify';
import {
  createInstitutionAdminHandler,
  createInstitutionHandler,
  getInstitutionsHandler,
  getPlanModulesHandler,
  // getPlanModulesHandler,
  updateInstitutionPutHandler,
} from '../controllers/institution.controller';

export default async function institutionRoutes(fastify: FastifyInstance) {
  fastify.post('/institution', createInstitutionHandler);
  fastify.post('/institutions/admin', createInstitutionAdminHandler);
}

export async function planRoutes(fastify: FastifyInstance) {
  fastify.get('/plans/:planId/modules', getPlanModulesHandler);
  fastify.get('/institutions', getInstitutionsHandler);
  fastify.put('/institutions/:id', updateInstitutionPutHandler);
}
