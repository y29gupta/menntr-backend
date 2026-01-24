import { authGuard } from '../../hooks/auth.guard';
import { getStudentAssessmentDetailsHandler, listStudentAssessmentsHandler } from '../../controllers/student/student-assessment.controller';

export async function studentAssessmentRoutes(app: any) {
  app.get('/student/assessments', { preHandler: [authGuard] }, listStudentAssessmentsHandler);

  app.get(
    '/student/assessments/:assessmentId',
    { preHandler: [authGuard] },
    getStudentAssessmentDetailsHandler
  );
}
