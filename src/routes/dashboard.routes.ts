// src/routes/dashboard.routes.ts
import { authGuard } from '../hooks/auth.guard';
import {
  academicPerformanceByDepartmentHandler,
  assessmentDashboardStatsHandler,
  avgAcademicPerformanceHandler,
  facultyDashboardStatsHandler,
  placementReadinessHandler,
  studentDashboardStatsHandler,
} from '../controllers/dashboard.controller';

export async function dashboardRoutes(app: any) {
  app.get('/dashboard/assessments', { preHandler: [authGuard] }, assessmentDashboardStatsHandler);

  app.get('/dashboard/students', { preHandler: [authGuard] }, studentDashboardStatsHandler);

  app.get('/dashboard/faculty', { preHandler: [authGuard] }, facultyDashboardStatsHandler);

  app.get(
    '/dashboard/academic-performance',
    { preHandler: [authGuard] },
    avgAcademicPerformanceHandler
  );

  app.get('/dashboard/placement-readiness', { preHandler: [authGuard] }, placementReadinessHandler);

  app.get(
    '/dashboard/academic-performance/departments',
    { preHandler: [authGuard] },
    academicPerformanceByDepartmentHandler
  );
}
