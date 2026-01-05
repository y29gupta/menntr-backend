import { FastifyInstance } from 'fastify';

import {
  getAvailableModulesHandler,
  getRolesbasedOnRoleHierarchy,
  getRolesHierarchy,
} from '../controllers/institution.admin.controller';

export async function institutionAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/institutionsadmin/role-hierarchy', getRolesHierarchy);
  fastify.get('/institutionsadmin/role-hierarchy/roles/:hierarchyId', getRolesbasedOnRoleHierarchy);
  fastify.get('/institutionsadmin/details', getAvailableModulesHandler);
}
