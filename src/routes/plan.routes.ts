import { addModulesToPlanHandler, getPlansHandler } from "../controllers/plan.controller";

export default async function (app: any) {
  app.get('/plans', getPlansHandler);
  
  app.post(
    '/plans/:id/modules',
    { preHandler: app.authenticate },
    addModulesToPlanHandler
  );
}
