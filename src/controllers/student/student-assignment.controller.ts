import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../../services/student/student-assignment.service';

/**
 * Utility to safely extract authenticated user
 */
function getAuthenticatedUser(req: any) {
  if (!req.user) {
    throw new Error('Unauthorized');
  }
  return req.user;
}

/**
 * GET /student/assignments
 */
export async function listStudentAssignmentsHandler(req: FastifyRequest, reply: FastifyReply) {
  try {
    const user = getAuthenticatedUser(req);

    const data = await service.listStudentAssignments(req.prisma, {
      student_id: BigInt(user.sub),
      institution_id: user.institution_id,
    });

    return reply.send(data);
  } catch (error: any) {
    return reply.status(400).send({
      success: false,
      message: error.message,
    });
  }
}

/**
 * GET /student/assignments/:assignmentId
 */
export async function getStudentAssignmentDetailsHandler(
  req: FastifyRequest<{ Params: { assignmentId: string } }>,
  reply: FastifyReply
) {
  try {
    const user = getAuthenticatedUser(req);

    const data = await service.getStudentAssignmentDetails(req.prisma, {
      student_id: BigInt(user.sub),
      institution_id: user.institution_id,
      assignment_id: BigInt(req.params.assignmentId),
    });

    return reply.send(data);
  } catch (error: any) {
    return reply.status(400).send({
      success: false,
      message: error.message,
    });
  }
}

/**
 * POST /student/assignments/:assignmentId/start
 */
export async function startAssignmentHandler(
  req: FastifyRequest<{ Params: { assignmentId: string } }>,
  reply: FastifyReply
) {
  try {
    const user = getAuthenticatedUser(req);

    const data = await service.startAssignment(req.prisma, {
      student_id: BigInt(user.sub),
      institution_id: user.institution_id,
      assignment_id: BigInt(req.params.assignmentId),
    });

    return reply.send({
      success: true,
      data,
    });
  } catch (error: any) {
    return reply.status(400).send({
      success: false,
      message: error.message,
    });
  }
}

/**
 * POST /student/assignments/:assignmentId/answer
 */
export async function saveAssignmentAnswerHandler(
  req: FastifyRequest<{
    Params: { assignmentId: string };
    Body: any;
  }>,
  reply: FastifyReply
) {
  try {
    const user = getAuthenticatedUser(req);

    const data = await service.saveAssignmentAnswer(req.prisma, {
      student_id: BigInt(user.sub),
      institution_id: user.institution_id,
      assignment_id: BigInt(req.params.assignmentId),
      body: req.body,
    });

    return reply.send({
      success: true,
      data,
    });
  } catch (error: any) {
    return reply.status(400).send({
      success: false,
      message: error.message,
    });
  }
}

/**
 * POST /student/assignments/:assignmentId/submit
 */
export async function submitAssignmentHandler(
  req: FastifyRequest<{ Params: { assignmentId: string } }>,
  reply: FastifyReply
) {
  try {
    const user = getAuthenticatedUser(req);

    const data = await service.submitAssignment(req.prisma, {
      student_id: BigInt(user.sub),
      institution_id: user.institution_id,
      assignment_id: BigInt(req.params.assignmentId),
    });

    return reply.send(data);
  } catch (error: any) {
    return reply.status(400).send({
      success: false,
      message: error.message,
    });
  }
}

/**
 * GET /student/assignments/overview
 * (No studentId param for security)
 */
export async function getStudentAssignmentOverviewHandler(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const user = getAuthenticatedUser(req);

    const data = await service.getStudentAssignmentOverview(
      req.prisma,
      BigInt(user.sub),
      user.institution_id
    );

    return reply.send({
      success: true,
      data,
    });
  } catch (error: any) {
    return reply.status(400).send({
      success: false,
      message: error.message,
    });
  }
}
