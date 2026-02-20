import { authGuard } from '../hooks/auth.guard';
import { assignAssignmentAudienceHandler, assignmentAudienceMetaHandler, assignmentAudienceSummaryHandler, assignmentMetaHandler, assignmentPublishSummaryHandler, assignmentQuestionMetaHandler, bulkUploadAssignmentCodingHandler, bulkUploadAssignmentMcqHandler, createAssignmentCodingQuestionHandler, createAssignmentHandler, createAssignmentMcqQuestionHandler, createAssignmentTheoryQuestionHandler, deleteAssignmentQuestionHandler, editAssignmentQuestionHandler, getAssignmentQuestionsHandler, listAssignmentsHandler, publishAssignmentFinalHandler } from '../controllers/assignment.controller';

export async function assignmentRoutes(app: any) {
  app.get('/assignments', { preHandler: [authGuard] }, listAssignmentsHandler);

  app.get('/assignments/meta', { preHandler: [authGuard] }, assignmentMetaHandler);

  app.post('/assignments', { preHandler: [authGuard] }, createAssignmentHandler);

  app.get('/assignments/audience/meta', { preHandler: [authGuard] }, assignmentAudienceMetaHandler);

  app.put(
    '/assignments/:id/audience',
    { preHandler: [authGuard] },
    assignAssignmentAudienceHandler
  );

  app.get(
    '/assignments/questions/meta',
    { preHandler: [authGuard] },
    assignmentQuestionMetaHandler
  );

  app.post(
    '/assignments/:id/questions/mcq',
    { preHandler: [authGuard] },
    createAssignmentMcqQuestionHandler
  );

  app.post(
    '/assignments/:id/questions/mcq/bulk-upload',
    { preHandler: [authGuard] },
    bulkUploadAssignmentMcqHandler
  );

  app.post('/assignments/:id/publish', { preHandler: [authGuard] }, publishAssignmentFinalHandler);

  app.post(
    '/assignments/:id/questions/coding',
    { preHandler: [authGuard] },
    createAssignmentCodingQuestionHandler
  );

  app.get('/assignments/:id/questions', { preHandler: [authGuard] }, getAssignmentQuestionsHandler);
  
  app.post(
    '/assignments/:id/questions/coding/bulk-upload',
    { preHandler: [authGuard] },
    bulkUploadAssignmentCodingHandler
  );

  app.get(
    '/assignments/:id/publish-summary',
    { preHandler: [authGuard] },
    assignmentPublishSummaryHandler
  );

  app.get(
    '/assignments/:id/audience-summary',
    { preHandler: [authGuard] },
    assignmentAudienceSummaryHandler
  );
  app.put(
    '/assignments/:assignmentId/questions/:assignmentQuestionId',
    { preHandler: [authGuard] },
    editAssignmentQuestionHandler
  );
  app.delete(
    '/assignments/:assignmentId/questions/:assignmentQuestionId',
    { preHandler: [authGuard] },
    deleteAssignmentQuestionHandler
  );

  app.post(
    '/assignments/:id/questions/theory',
    { preHandler: [authGuard] },
    createAssignmentTheoryQuestionHandler
  );
}


