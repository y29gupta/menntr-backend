// controllers/candidate-report.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../services/candidate-report.service';

export async function getCandidateReportHandler(
  req: FastifyRequest<{
    Params: {
      assessmentId: string;
      attemptId: string;
    };
  }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getCandidateReport(
    req.prisma,
    BigInt(req.params.assessmentId),
    BigInt(req.params.attemptId),
    user.institution_id
  );

  reply.send(data);
}
