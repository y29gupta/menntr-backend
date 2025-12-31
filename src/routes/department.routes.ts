import {
  addDepartment,
  listDepartments,
  editDepartment,
  departmentMeta,
} from '../controllers/department.controller';
import { authGuard } from '../hooks/auth.guard';

export async function departmentRoutes(app: any) {
  app.post('/organization/departments', addDepartment);
  app.get('/organization/departments', listDepartments);
  app.put('/organization/departments/:id', editDepartment);
  app.get(
  '/organization/departments/meta',
  { preHandler: [authGuard] },
  departmentMeta
);
}
