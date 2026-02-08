import {
  addDepartment,
  listDepartments,
  editDepartment,
  departmentMeta,
  deleteDepartment,
} from '../controllers/department.controller';
import { authGuard } from '../hooks/auth.guard';

export async function departmentRoutes(app: any) {
  app.post(
    '/organization/departments',
    { preHandler: [authGuard] },
    addDepartment
  );
  app.get(
    '/organization/departments',
    { preHandler: [authGuard] },
    listDepartments
  );
  app.put(
    '/organization/departments/:id',
    { preHandler: [authGuard] },
    editDepartment
  );
  app.get(
    '/organization/departments/meta',
    { preHandler: [authGuard] },
    departmentMeta
  );
  app.delete(
    '/organization/departments/:id',
    { preHandler: [authGuard] },
    deleteDepartment
  );
}
