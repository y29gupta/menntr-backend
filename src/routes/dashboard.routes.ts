// src/routes/dashboard.routes.ts
import { authGuard } from '../hooks/auth.guard';
import { assessmentDashboardStatsHandler } from '../controllers/dashboard.controller';

export async function dashboardRoutes(app: any) {
  app.get('/dashboard/assessments', { preHandler: [authGuard] }, assessmentDashboardStatsHandler);
}
