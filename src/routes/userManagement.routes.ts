import { listUsers, getBatchesForFaculty } from '../controllers/userManagement.controller';
import { authGuard } from '../hooks/auth.guard';

export async function userManagementRoutes(app: any) {
  app.get(
    '/user-management/users',
    { preHandler: [authGuard] },
    listUsers
  );

  app.get(
    '/user-management/batches-for-faculty',
    { preHandler: [authGuard] },
    getBatchesForFaculty
  );
}
