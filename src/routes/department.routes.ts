import {
  addDepartment,
  listDepartments,
  editDepartment,
} from '../controllers/department.controller';

export async function departmentRoutes(app: any) {
  app.post('/organization/departments', addDepartment);
  app.get('/organization/departments', listDepartments);
  app.put('/organization/departments/:id', editDepartment);
}
