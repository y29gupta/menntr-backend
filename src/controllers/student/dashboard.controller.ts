import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../../services/student/dashboard.service';

export async function studentDashboardHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const result = await service.getStudentDashboard(
    req.prisma,
    BigInt(user.sub),
    user.institution_id
  );

  reply.send(result);
}

// 🔥 NEW HANDLER
export async function studentAssessmentListHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const result = await service.getStudentAssessmentLists(
    req.prisma,
    BigInt(user.sub),
    user.institution_id
  );

  reply.send(result);
}

export async function studentPlacementReadinessHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const result = await service.getStudentPlacementReadiness(
    req.prisma,
    BigInt(user.sub),
    user.institution_id
  );

  reply.send(result);
}