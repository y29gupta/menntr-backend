import { FastifyInstance } from 'fastify';

import {
  createUserFlexible,
  getAvailableModulesHandler,
  getFeaturePermissionsHandler,
  getModuleFeaturesHandler,
  getModulesHandler,
  getRolesbasedOnRoleHierarchy,
  getRolesHierarchy,
  getUserAccessSummaryHandler,
} from '../controllers/institution.admin.controller';

export async function institutionAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/institutionsadmin/role-hierarchy', getRolesHierarchy);
  fastify.get('/institutionsadmin/role-hierarchy/roles/:hierarchyId', getRolesbasedOnRoleHierarchy);
  fastify.get('/institutionsadmin/details', getAvailableModulesHandler);
  fastify.get('/institutionsadmin/modules', getModulesHandler);
  fastify.get('/institutionsadmin/modules/features/:moduleId', getModuleFeaturesHandler);
  fastify.get('/institutionsadmin/features/permissions/:featureCode', getFeaturePermissionsHandler);
  fastify.post('/institutionsadmin/create-user', createUserFlexible);
  fastify.get('/institutionsadmin/access-summary/:userId', getUserAccessSummaryHandler);
}
