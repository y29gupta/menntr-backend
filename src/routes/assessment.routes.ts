import { authGuard } from '../hooks/auth.guard';
import {
  assessmentMetaHandler,
  questionMetaHandler,
  createAssessmentHandler,
  assignAudienceHandler,
  addQuestionHandler,
  bulkAddQuestionsHandler,
  assessmentSummaryHandler,
  scheduleAssessmentHandler,
  publishAssessmentHandler,
  listAssessmentsHandler,
  getAssessmentHandler,
  createMCQQuestionHandler,
  assessmentAudienceMetaHandler,
  listAssessmentQuestionsHandler,
  getAssessmentAudienceHandler,
  getAssessmentAccessHandler,
  updateAssessmentAccessHandler,
  deleteAssessmentHandler,
  bulkCreateMcqForAssessmentHandler,
  bulkUploadMcqHandler,
} from '../controllers/assessment.controller';

export async function assessmentRoutes(app: any) {
  app.delete('/assessments/:id', { prehandler: [authGuard] }, deleteAssessmentHandler);

  // META
  app.get('/assessments/meta', { preHandler: [authGuard] }, assessmentMetaHandler);
  app.get('/questions/meta', { preHandler: [authGuard] }, questionMetaHandler);
  app.get(
  '/assessments/audience/meta',
  { preHandler: [authGuard] },
  assessmentAudienceMetaHandler
);


  // CORE FLOW
  app.post('/assessments', { preHandler: [authGuard] }, createAssessmentHandler);
  app.put('/assessments/:id/audience', { preHandler: [authGuard] }, assignAudienceHandler);
  app.post('/assessments/:id/questions', { preHandler: [authGuard] }, addQuestionHandler);
  app.post('/assessments/:id/questions/bulk', { preHandler: [authGuard] }, bulkAddQuestionsHandler);
app.post(
  '/assessments/:id/questions/create',
  { preHandler: [authGuard] },
  createMCQQuestionHandler
);
  app.get('/assessments/:id/summary', { preHandler: [authGuard] }, assessmentSummaryHandler);
  app.put('/assessments/:id/schedule', { preHandler: [authGuard] }, scheduleAssessmentHandler);
  app.post('/assessments/:id/publish', { preHandler: [authGuard] }, publishAssessmentHandler);

  // LIST
  app.get('/assessments', { preHandler: [authGuard] }, listAssessmentsHandler);
  app.get('/assessments/:id', { preHandler: [authGuard] }, getAssessmentHandler);
  app.get(
  '/assessments/:id/questions',
  { preHandler: [authGuard] },
  listAssessmentQuestionsHandler
);
app.get('/assessments/:id/audience',{preHandler: [authGuard]}, getAssessmentAudienceHandler);
app.put('/assessments/:id/access', {preHandler: [authGuard]}, updateAssessmentAccessHandler);
app.get('/assessments/:id/access', {preHandler: [authGuard]}, getAssessmentAccessHandler);

app.post('/assessments/:id/mcq/bulk-upload', { preHandler: [authGuard] }, bulkUploadMcqHandler);

// upload bulk mcq questions assessment
app.post(
  '/assessments/:id/mcq/bulk-create',
  { preHandler: [authGuard] },
  bulkCreateMcqForAssessmentHandler
);
}
