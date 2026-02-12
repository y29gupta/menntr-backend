import { authGuard } from '../../hooks/auth.guard';
import { studentAssessmentResultHandler } from '../../controllers/student/assessment.controller';

export async function studentAssessmentResultRoutes(app: any) {
  app.get(
    '/student/assessments/:assessmentId/result',
    { preHandler: [authGuard] },
    studentAssessmentResultHandler
  );
}
