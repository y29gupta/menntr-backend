import { authGuard } from '../../hooks/auth.guard';
import {
  getRuntimeConfigHandler,
  getQuestionHandler,
  saveMcqAnswerHandler,
  flagQuestionHandler,
  submitAssessmentHandler,
  runCodingHandler,
  saveCodingSubmissionHandler,
  getSubmitPreviewHandler,
} from '../../controllers/student/student-assessment.runtime.controller';

export async function studentAssessmentRuntimeRoutes(app: any) {
  app.get(
    '/student/assessments/:assessmentId/runtime',
    { preHandler: [authGuard] },
    getRuntimeConfigHandler
  );

  app.get(
    '/student/assessments/:assessmentId/questions/:index',
    { preHandler: [authGuard] },
    getQuestionHandler
  );

  app.post(
    '/student/assessments/:assessmentId/answers/mcq',
    { preHandler: [authGuard] },
    saveMcqAnswerHandler
  );
  app.post(
    '/student/assessments/:assessmentId/answers/coding/run',
    { preHandler: [authGuard] },
    runCodingHandler
  );

  app.post(
    '/student/assessments/:assessmentId/answers/coding/save',
    { preHandler: [authGuard] },
    saveCodingSubmissionHandler
  );
  app.post(
    '/student/assessments/:assessmentId/questions/:questionId/flag',
    { preHandler: [authGuard] },
    flagQuestionHandler
  );

  app.get(
    '/student/assessments/:assessmentId/submit-preview',
    { preHandler: [authGuard] },
    getSubmitPreviewHandler
  );

  app.post(
    '/student/assessments/:assessmentId/submit',
    { preHandler: [authGuard] },
    submitAssessmentHandler
  );
}
