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