// src/controllers/dashboard.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../services/dashboard.service';

export async function assessmentDashboardStatsHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const data = await service.getAssessmentDashboardStats(req.prisma, user.institution_id);

  reply.send(data);
}
