import { addModulesToPlanHandler } from "../controllers/plan.controller";

export default async function (app: any) {
  app.post(
    '/plans/:id/modules',
    { preHandler: app.authenticate },
    addModulesToPlanHandler
  );
}
