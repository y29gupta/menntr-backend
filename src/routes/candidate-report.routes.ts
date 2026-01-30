// routes/candidate-report.routes.ts
import { authGuard } from '../hooks/auth.guard';
import { getCandidateReportHandler } from '../controllers/candidate-report.controller';

export async function candidateReportRoutes(app: any) {
  app.get(
    '/assessments/:assessmentId/attempts/:attempt_number/report',
    { preHandler: [authGuard] },
    getCandidateReportHandler
  );

}
