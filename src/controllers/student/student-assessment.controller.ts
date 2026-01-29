import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../../services/student/student-assessment.service';

/* -----------------------------
   TYPES
------------------------------ */
interface ListAssessmentsQuery {
  status?: 'ongoing' | 'upcoming' | 'completed';
}

/* -----------------------------
   LIST STUDENT ASSESSMENTS
------------------------------ */
export async function listStudentAssessmentsHandler(
  req: FastifyRequest<{ Querystring: ListAssessmentsQuery }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.listStudentAssessments(req.prisma, {
    student_id: BigInt(user.sub),
    institution_id: user.institution_id,
    status: req.query.status ?? 'ongoing',
  });

  reply.send(data);
}

export async function getStudentAssessmentDetailsHandler(
  req: FastifyRequest<{ Params: { assessmentId: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getStudentAssessmentDetails(req.prisma, {
    student_id: BigInt(user.sub),
    institution_id: user.institution_id,
    assessment_id: BigInt(req.params.assessmentId),
  });

  reply.send(data);
}

export async function startAssessmentConsentHandler(
  req: FastifyRequest<{ Params: { assessmentId: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.startAssessmentConsent(req.prisma, {
    student_id: BigInt(user.sub),
    institution_id: user.institution_id,
    assessment_id: BigInt(req.params.assessmentId),
  });

  reply.send(data);
}

export async function getMicCheckHandler(
  req: FastifyRequest<{ Params: { assessmentId: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getMicCheck(req.prisma, {
    student_id: BigInt(user.sub),
    institution_id: user.institution_id,
    assessment_id: BigInt(req.params.assessmentId),
  });

  reply.send(data);
}

export async function startMicCheckHandler(
  req: FastifyRequest<{ Params: { assessmentId: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.startMicCheck(req.prisma, {
    student_id: BigInt(user.sub),
    institution_id: user.institution_id,
    assessment_id: BigInt(req.params.assessmentId),
  });

  reply.send(data);
}

export async function submitMicCheckResultHandler(
  req: FastifyRequest<{
    Params: { assessmentId: string };
    Body: { success: boolean };
  }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.submitMicCheckResult(req.prisma, {
    student_id: BigInt(user.sub),
    institution_id: user.institution_id,
    assessment_id: BigInt(req.params.assessmentId),
    success: req.body.success,
  });

  reply.send(data);
}

export async function getCameraCheckHandler(
  req: FastifyRequest<{ Params: { assessmentId: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getCameraCheck(req.prisma, {
    student_id: BigInt(user.sub),
    institution_id: user.institution_id,
    assessment_id: BigInt(req.params.assessmentId),
  });

  reply.send(data);
}

export async function startCameraCheckHandler(
  req: FastifyRequest<{ Params: { assessmentId: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.startCameraCheck(req.prisma, {
    student_id: BigInt(user.sub),
    institution_id: user.institution_id,
    assessment_id: BigInt(req.params.assessmentId),
  });

  reply.send(data);
}

export async function submitCameraCheckResultHandler(
  req: FastifyRequest<{
    Params: { assessmentId: string };
    Body: { success: boolean };
  }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.submitCameraCheckResult(req.prisma, {
    student_id: BigInt(user.sub),
    institution_id: user.institution_id,
    assessment_id: BigInt(req.params.assessmentId),
    success: req.body.success,
  });

  reply.send(data);
}

export async function startAssessmentHandler(
  req: FastifyRequest<{ Params: { assessmentId: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.startAssessment(req.prisma, {
    student_id: BigInt(user.sub),
    institution_id: user.institution_id,
    assessment_id: BigInt(req.params.assessmentId),
  });

  reply.send(data);
}
