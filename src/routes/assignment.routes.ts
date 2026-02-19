import { authGuard } from '../hooks/auth.guard';
import { assignAssignmentAudienceHandler, assignmentAudienceMetaHandler, assignmentMetaHandler, assignmentQuestionMetaHandler, bulkUploadAssignmentMcqHandler, createAssignmentHandler, createAssignmentMcqQuestionHandler, listAssignmentsHandler, publishAssignmentFinalHandler } from '../controllers/assignment.controller';

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
}