import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../services/dashboard.service';

/**
 * Students dashboard card
 */
export async function studentDashboardStatsHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const data = await service.getStudentDashboardStats(req.prisma, user.institution_id);

  reply.send(data);
}

/**
 * Faculty dashboard card
 */
export async function facultyDashboardStatsHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const data = await service.getFacultyDashboardStats(req.prisma, user.institution_id);

  reply.send(data);
}

/**
 * Assessments dashboard card
 */
export async function assessmentDashboardStatsHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const data = await service.getAssessmentDashboardStats(req.prisma, user.institution_id);

  reply.send(data);
}

/**
 * Avg Academic Performance card
 */
export async function avgAcademicPerformanceHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const data = await service.getAvgAcademicPerformance(req.prisma, user.institution_id);

  reply.send(data);
}

/**
 * Placement Readiness card
 */
export async function placementReadinessHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const data = await service.getPlacementReadinessOverview(req.prisma, user.institution_id);

  reply.send(data);
}

/**
 * Academic Performance by Department
 */
export async function academicPerformanceByDepartmentHandler(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getAcademicPerformanceByDepartment(req.prisma, user.institution_id);

  reply.send(data);
}
