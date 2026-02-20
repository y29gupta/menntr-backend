import { authGuard } from '../../hooks/auth.guard';
import {
  listStudentAssignmentsHandler,
  getStudentAssignmentDetailsHandler,
  startAssignmentHandler,
  saveAssignmentAnswerHandler,
  submitAssignmentHandler,
  getStudentAssignmentOverviewHandler,
} from '../../controllers/student/student-assignment.controller';

export async function studentAssignmentRoutes(app: any) {
  app.get('/student/assignments', { preHandler: [authGuard] }, listStudentAssignmentsHandler);

  app.get(
    '/student/assignments/:assignmentId',
    { preHandler: [authGuard] },
    getStudentAssignmentDetailsHandler
  );

  app.post(
    '/student/assignments/:assignmentId/start',
    { preHandler: [authGuard] },
    startAssignmentHandler
  );

  app.post(
    '/student/assignments/:assignmentId/answer',
    { preHandler: [authGuard] },
    saveAssignmentAnswerHandler
  );

  app.post(
    '/student/assignments/:assignmentId/submit',
    { preHandler: [authGuard] },
    submitAssignmentHandler
  );

  // 🔥 safer — no param
  app.get(
    '/student/assignments/overview',
    { preHandler: [authGuard] },
    getStudentAssignmentOverviewHandler
  );
}
