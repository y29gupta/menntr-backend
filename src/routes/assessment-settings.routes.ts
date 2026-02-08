import { authGuard } from '../hooks/auth.guard';
import {
  getAssessmentSettingsHandler,
  updateAssessmentSettingsHandler,
} from '../controllers/assessment-settings.controller';

export async function assessmentSettingsRoutes(app: any) {
  app.get('/assessments/:id/settings', { preHandler: [authGuard] }, getAssessmentSettingsHandler);

  app.put(
    '/assessments/:id/settings',
    { preHandler: [authGuard] },
    updateAssessmentSettingsHandler
  );
}
