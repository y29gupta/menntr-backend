// src/services/dashboard.service.ts
import { PrismaClient } from '@prisma/client';

export async function getAssessmentDashboardStats(prisma: PrismaClient, institutionId: number) {
  const now = new Date();

  // ─────────────────────────────
  // Date ranges
  // ─────────────────────────────
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  // ─────────────────────────────
  // Queries
  // ─────────────────────────────

  const [totalAssessments, thisMonthCount, lastMonthCount, dueTodayCount] = await Promise.all([
    prisma.assessments.count({
      where: {
        institution_id: institutionId,
        is_deleted: false,
      },
    }),

    prisma.assessments.count({
      where: {
        institution_id: institutionId,
        is_deleted: false,
        created_at: {
          gte: startOfThisMonth,
        },
      },
    }),

    prisma.assessments.count({
      where: {
        institution_id: institutionId,
        is_deleted: false,
        created_at: {
          gte: startOfLastMonth,
          lte: endOfLastMonth,
        },
      },
    }),

    prisma.assessments.count({
      where: {
        institution_id: institutionId,
        is_deleted: false,
        end_time: {
          gte: startOfToday,
          lte: endOfToday,
        },
        status: {
          in: ['published', 'active'],
        },
      },
    }),
  ]);

  // ─────────────────────────────
  // Percentage calculation
  // ─────────────────────────────
  let percentageChange = 0;

  if (lastMonthCount > 0) {
    percentageChange = ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100;
  } else if (thisMonthCount > 0) {
    percentageChange = 100;
  }

  return {
    total: totalAssessments,
    percentageChange: Number(percentageChange.toFixed(1)),
    trend: percentageChange >= 0 ? 'up' : 'down',
    dueToday: dueTodayCount,
  };
}
