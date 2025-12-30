import {
  getHierarchy,
  addCategory,
  addDepartment,
  moveNode,
  deleteNode,
} from '../controllers/organization.controller';
import { authGuard } from '../hooks/auth.guard';

export async function organizationRoutes(app: any) {
app.get(
  '/organization/hierarchy',
  { preHandler: [authGuard] },
  getHierarchy
);
  app.post('/organization/category', addCategory);
  app.post('/organization/department', addDepartment);
  app.put('/organization/hierarchy/:id/move', moveNode);
  app.delete('/organization/hierarchy/:id', deleteNode);
}
