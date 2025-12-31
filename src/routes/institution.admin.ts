import { FastifyInstance } from 'fastify';

import {
  createInstitutionMemberHandler,
  getFeaturesWithPermissionsHandler,
  getModuleFeaturesHandler,
  getModulesHandler,
  getRolesbasedOnRoleHierarchy,
  getRolesHierarchy,
} from '../controllers/institution.admin.controller';

export async function institutionAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/institutionsadmin/role-hierarchy', getRolesHierarchy);
  fastify.post('/institutionsadmin/members', createInstitutionMemberHandler);
  fastify.get('/institutionsadmin/role-hierarchy/roles/:hierarchyId', getRolesbasedOnRoleHierarchy);
  fastify.get('/institutionsadmin/modules', getModulesHandler);
  fastify.get('/institutionsadmin/features/:moduleId', getModuleFeaturesHandler);
  fastify.get('/institutionsadmin/features-name/:featureCode', getFeaturesWithPermissionsHandler);
}
