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
  getUserForEdit,
  listUsers,
  updateUserFlexible,
} from '../controllers/institution.admin.controller';
import { authGuard } from '../hooks/auth.guard';

export async function institutionAdminRoutes(app: any) {
  app.get('/institutionsadmin/role-hierarchy', { preHandler: [authGuard] }, getRolesHierarchy);
  app.get('/institutionsadmin/role-hierarchy/roles/:hierarchyId', { preHandler: [authGuard] }, getRolesbasedOnRoleHierarchy);
  app.get('/institutionsadmin/modules', { preHandler: [authGuard] }, getModulesHandler);
  app.get('/institutionsadmin/modules/features/:moduleId', { preHandler: [authGuard] }, getModuleFeaturesHandler);
  app.get('/institutionsadmin/features/permissions/:featureCode', { preHandler: [authGuard] }, getFeaturePermissionsHandler);
  app.post('/institutionsadmin/create-user', { preHandler: [authGuard] }, createUserFlexible);
  app.post('/institutionsadmin/members', { preHandler: [authGuard] }, createInstitutionMemberHandler);
  app.get('/institutionsadmin/user-management/users', { preHandler: [authGuard] }, listUsers);
  app.post('/users/bulk-upload', { preHandler: [authGuard] }, bulkCreateUsersFromExcel);
  app.patch('/users/status/:id', { preHandler: [authGuard] }, changeUserStatus);
  app.get('/users/:userId/edit', { preHandler: [authGuard] }, getUserForEdit);
  app.put('/users/:userId', { preHandler: [authGuard] }, updateUserFlexible);
}
