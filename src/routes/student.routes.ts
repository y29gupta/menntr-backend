import { authGuard } from '../hooks/auth.guard';
import {
  listStudentsHandler,
  studentMetaHandler,
  createStudentHandler,
  academicMetaHandler,
  academicBatchesHandler,
  academicDepartmentsHandler,
  saveAcademicDetailsHandler,
  enrollmentMetaHandler,
  saveEnrollmentHandler,
  getPlatformAccessHandler,
  savePlatformAccessHandler,
  getAdditionalInfoHandler,
  saveAdditionalInfoHandler,
  deleteStudentHandler,
  getStudentHandler,
  updateStudentHandler,
} from '../controllers/student.controller';

export async function studentRoutes(app: any) {
  // META
  app.get('/students/meta', { preHandler: [authGuard] }, studentMetaHandler);

  // LIST
  app.get('/students', { preHandler: [authGuard] }, listStudentsHandler);

  // CREATE (Add Student)
  app.post('/students', { preHandler: [authGuard] }, createStudentHandler);

  // Academic Details
  app.get('/students/academic/meta', { preHandler: [authGuard] }, academicMetaHandler);
  app.get(
    '/students/academic/meta/departments',
    { preHandler: [authGuard] },
    academicDepartmentsHandler
  );
  app.get('/students/academic/meta/batches', { preHandler: [authGuard] }, academicBatchesHandler);

  app.post('/students/:id/academic', { preHandler: [authGuard] }, saveAcademicDetailsHandler);

  app.get('/students/enrollment/meta', { preHandler: [authGuard] }, enrollmentMetaHandler);

  app.post('/students/:id/enrollment', { preHandler: [authGuard] }, saveEnrollmentHandler);

  app.get('/students/:id/platform-access', { preHandler: [authGuard] }, getPlatformAccessHandler);

  app.post('/students/:id/platform-access', { preHandler: [authGuard] }, savePlatformAccessHandler);

  app.get('/students/:id/additional-info', { preHandler: [authGuard] }, getAdditionalInfoHandler);

  app.post('/students/:id/additional-info', { preHandler: [authGuard] }, saveAdditionalInfoHandler);

  app.delete('/students/:id', { preHandler: [authGuard] }, deleteStudentHandler);

  app.get('/students/:id', { preHandler: [authGuard] }, getStudentHandler);
  
  app.put('/students/:id', { preHandler: [authGuard] }, updateStudentHandler);
}
