// controllers/proctoring-insights.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { generateProctoringInsights } from '../services/proctoring-insights.service';

export async function generateProctoringInsightsHandler(
  req: FastifyRequest<{ Params: { attemptId: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await generateProctoringInsights(
    req.prisma,
    BigInt(req.params.attemptId),
    user.institution_id
  );

  reply.send({
    success: true,
    status: result.status,
    message:
      result.status === 'PROCESSING'
        ? 'The video is on its way. Please allow up to 24 hours for processing.'
        : 'No suspicious activity detected',
  });
}
