import { attachModulesToPlan } from "../services/plan.service";

export async function addModulesToPlanHandler(request:any, reply:any) {
  const { planId, moduleIds } = request.body;
  await attachModulesToPlan(request.prisma, planId, moduleIds);
  return reply.send({ success: true });
}
