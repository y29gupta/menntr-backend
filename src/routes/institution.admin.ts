import { FastifyInstance } from 'fastify';

import {
  bulkCreateUsersFromExcel,
  changeUserStatus,
  createInstitutionMemberHandler,
  createUserFlexible,
  getFeaturePermissionsHandler,
  getModuleFeaturesHandler,
  getModulesHandler,
  getRolesbasedOnRoleHierarchy,
  getRolesHierarchy,
  listUsers,
} from '../controllers/institution.admin.controller';
import { authGuard } from '../hooks/auth.guard';

export async function institutionAdminRoutes(fastify: FastifyInstance) {
  fastify.get('/institutionsadmin/role-hierarchy', getRolesHierarchy);
  fastify.get('/institutionsadmin/role-hierarchy/roles/:hierarchyId', getRolesbasedOnRoleHierarchy);
  fastify.get('/institutionsadmin/modules', getModulesHandler);
  fastify.get('/institutionsadmin/modules/features/:moduleId', getModuleFeaturesHandler);
  fastify.get('/institutionsadmin/features/permissions/:featureCode', getFeaturePermissionsHandler);
  fastify.post('/institutionsadmin/create-user', createUserFlexible);
  fastify.post('/institutionsadmin/members', createInstitutionMemberHandler);
  fastify.get('/institutionsadmin/user-management/users', listUsers);
  fastify.post('/users/bulk-upload', bulkCreateUsersFromExcel);
  fastify.patch('/users/status/:id', changeUserStatus);
}
