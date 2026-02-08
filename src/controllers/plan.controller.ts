import { FastifyRequest, FastifyReply } from 'fastify';
import { attachModulesToPlan, getAllPlans } from "../services/plan.service";

export async function addModulesToPlanHandler(request:any, reply:any) {
  const { planId, moduleIds } = request.body;
  await attachModulesToPlan(request.prisma, planId, moduleIds);
  return reply.send({ success: true });
}

export async function getPlansHandler(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const plans = await getAllPlans(req.prisma);
  reply.send({ data: plans });
}
