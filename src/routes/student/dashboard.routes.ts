import { authGuard } from '../../hooks/auth.guard';
import { studentAssessmentListHandler, studentDashboardHandler, studentPlacementReadinessHandler } from '../../controllers/student/dashboard.controller';

export async function studentDashboardRoutes(app: any) {
  app.get('/student/dashboard', { preHandler: [authGuard] }, studentDashboardHandler);

  app.get(
    '/student/dashboard/assessments',
    { preHandler: [authGuard] },
    studentAssessmentListHandler
  );

  app.get(
    '/student/dashboard/placement-readiness',
    {preHandler: [authGuard]},
    studentPlacementReadinessHandler
  )
}
