import { authGuard } from '../../hooks/auth.guard';
import { getCameraCheckHandler, getMicCheckHandler, getStudentAssessmentDetailsHandler, listStudentAssessmentsHandler, startAssessmentConsentHandler, startAssessmentHandler, startCameraCheckHandler, startMicCheckHandler, submitCameraCheckResultHandler, submitMicCheckResultHandler } from '../../controllers/student/student-assessment.controller';

export async function studentAssessmentRoutes(app: any) {
  app.get('/student/assessments', { preHandler: [authGuard] }, listStudentAssessmentsHandler);

  app.get(
    '/student/assessments/:assessmentId',
    { preHandler: [authGuard] },
    getStudentAssessmentDetailsHandler
  );

  app.post(
    '/student/assessments/:assessmentId/consent',
    { preHandler: [authGuard] },
    startAssessmentConsentHandler
  );

  app.get(
    '/student/assessments/:assessmentId/mic-check',
    { preHandler: [authGuard] },
    getMicCheckHandler
  );

  app.post(
    '/student/assessments/:assessmentId/mic-check/start',
    { preHandler: [authGuard] },
    startMicCheckHandler
  );

  app.post(
    '/student/assessments/:assessmentId/mic-check/result',
    { preHandler: [authGuard] },
    submitMicCheckResultHandler
  );

  app.get(
    '/student/assessments/:assessmentId/camera-check',
    { preHandler: [authGuard] },
    getCameraCheckHandler
  );

  app.post(
    '/student/assessments/:assessmentId/camera-check/start',
    { preHandler: [authGuard] },
    startCameraCheckHandler
  );

  app.post(
    '/student/assessments/:assessmentId/camera-check/result',
    { preHandler: [authGuard] },
    submitCameraCheckResultHandler
  );

  app.post(
    '/student/assessments/:assessmentId/start',
    { preHandler: [authGuard] },
    startAssessmentHandler
  );
}
