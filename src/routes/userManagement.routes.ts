import { listUsers } from '../controllers/userManagement.controller';
import { authGuard } from '../hooks/auth.guard';

export async function userManagementRoutes(app: any) {
  app.get(
    '/user-management/users',
    { preHandler: [authGuard] },
    listUsers
  );
}
