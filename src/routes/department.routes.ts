import {
  addDepartment,
  listDepartments,
  editDepartment,
  departmentMeta,
  deleteDepartment,
  getDistinctDepartments,
  getDistinctCategories,
  getDistinctHods,
} from '../controllers/department.controller';
import { authGuard } from '../hooks/auth.guard';

export async function departmentRoutes(app: any) {
  app.post('/organization/departments', { preHandler: [authGuard] }, addDepartment);
  app.get('/organization/departments', { preHandler: [authGuard] }, listDepartments);
  app.get(
    '/organization/distinct/departments',
    { preHandler: [authGuard] },
    getDistinctDepartments
  );
  app.get('/organization/distinct/categories', { preHandler: [authGuard] }, getDistinctCategories);
  app.get('/organization/distinct/hods', { preHandler: [authGuard] }, getDistinctHods);
  app.put('/organization/departments/:id', { preHandler: [authGuard] }, editDepartment);
  app.get('/organization/departments/meta', { preHandler: [authGuard] }, departmentMeta);
  app.delete('/organization/departments/:id', { preHandler: [authGuard] }, deleteDepartment);
}
