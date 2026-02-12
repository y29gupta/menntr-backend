import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../../services/student/assessment.service';

export async function studentAssessmentResultHandler(
  req: FastifyRequest<{ Params: { assessmentId: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await service.getStudentAssessmentResult(
    req.prisma,
    BigInt(req.params.assessmentId),
    BigInt(user.sub),
    user.institution_id
  );

  reply.send(result);
}
