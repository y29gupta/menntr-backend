// routes/proctoring-insights.routes.ts
import { authGuard } from '../hooks/auth.guard';
import { generateProctoringInsightsHandler } from '../controllers/proctoring-insights.controller';

export async function proctoringInsightsRoutes(app: any) {
  app.post(
    '/attempts/:attemptId/proctoring/generate',
    { preHandler: [authGuard] },
    generateProctoringInsightsHandler
  );
}
