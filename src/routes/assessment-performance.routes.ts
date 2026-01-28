import { authGuard } from '../hooks/auth.guard';
import {
  getAssessmentPerformanceOverviewHandler,
  getQuestionWisePerformanceHandler,
  getCandidatePerformanceHandler,
  getStudentAttemptSummaryHandler,
  getStudentSectionPerformanceHandler,
  getStudentIntegrityHandler,
  getAssessmentAttemptNumbersHandler,
} from '../controllers/assessment-performance.controller';

export async function assessmentPerformanceRoutes(app: any) {
  // Overview cards + score distribution
  app.get(
    '/assessments/:id/performance/overview',
    { preHandler: [authGuard] },
    getAssessmentPerformanceOverviewHandler
  );

  // Question-wise performance chart
  app.get(
    '/assessments/:id/performance/questions',
    { preHandler: [authGuard] },
    getQuestionWisePerformanceHandler
  );

//   // Candidate performance table
//   app.get(
//     '/assessments/:id/performance/candidates',
//     { preHandler: [authGuard] },
//     getCandidatePerformanceHandler
//   );

  app.get(
    '/assessments/:assessmentId/students/:studentId/attempts/:attemptId/summary',
    { preHandler: [authGuard] },
    getStudentAttemptSummaryHandler
  );

  app.get(
    '/assessments/:assessmentId/students/:studentId/attempts/:attemptId/sections',
    { preHandler: [authGuard] },
    getStudentSectionPerformanceHandler
  );

  app.get(
    '/assessments/:assessmentId/students/:studentId/attempts/:attemptId/integrity',
    { preHandler: [authGuard] },
    getStudentIntegrityHandler
  );


  app.get(
    '/assessments/:id/performance/attempts',
    { preHandler: [authGuard] },
    getAssessmentAttemptNumbersHandler
  );

  app.get(
    '/assessments/:id/performance/candidates',
    { preHandler: [authGuard] },
    getCandidatePerformanceHandler
  );
}
