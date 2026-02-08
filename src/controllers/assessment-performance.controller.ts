import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../services/assessment-performance.service';
import { ForbiddenError } from '../utils/errors';

export async function getAssessmentPerformanceOverviewHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getAssessmentPerformanceOverview(
    req.prisma,
    BigInt(req.params.id),
    user.institution_id
  );

  reply.send(data);
}

export async function getQuestionWisePerformanceHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getQuestionWisePerformance(
    req.prisma,
    BigInt(req.params.id),
    user.institution_id
  );

  reply.send(data);
}

export async function getCandidatePerformanceHandler(
  req: FastifyRequest<{
    Params: { id: string };
    Querystring: {
      page?: number;
      limit?: number;
      search?: string;
      attempt?: number;
    };
  }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getCandidatePerformance(
    req.prisma,
    BigInt(req.params.id),
    user.institution_id,
    req.query
  );

  reply.send(data);
}

type Params = {
  assessmentId: string;
  studentId: string;
  attemptId: string;
};

export async function getStudentAttemptSummaryHandler(
  req: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getStudentAttemptSummary(
    req.prisma,
    BigInt(req.params.assessmentId),
    BigInt(req.params.studentId),
    BigInt(req.params.attemptId),
    user.institution_id
  );

  reply.send(data);
}

export async function getStudentSectionPerformanceHandler(
  req: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getStudentSectionPerformance(
    req.prisma,
    BigInt(req.params.assessmentId),
    BigInt(req.params.studentId),
    BigInt(req.params.attemptId),
    user.institution_id
  );

  reply.send(data);
}

export async function getStudentIntegrityHandler(
  req: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getStudentIntegrity(
    req.prisma,
    BigInt(req.params.assessmentId),
    BigInt(req.params.studentId),
    BigInt(req.params.attemptId),
    user.institution_id
  );

  reply.send(data);
}

export async function getAssessmentAttemptNumbersHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getAssessmentAttemptNumbers(
    req.prisma,
    BigInt(req.params.id),
    user.institution_id
  );

  reply.send(data);
}