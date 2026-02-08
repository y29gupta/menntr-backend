import { PrismaClient } from '@prisma/client';
import { buildMonthlySeries } from './dashboard.utils';

type UserRole = 'Student' | 'Faculty';

/**
 * ─────────────────────────────────────────────
 * INTERNAL SHARED HELPER (DO NOT EXPORT)
 * ─────────────────────────────────────────────
 */
async function getUserDashboardStats(
  prisma: PrismaClient,
  institutionId: number,
  roleName: UserRole
) {
  const monthly = await prisma.$queryRaw<{ month: number; count: number }[]>`
    SELECT
      EXTRACT(YEAR FROM u.created_at)::int * 100 +
      EXTRACT(MONTH FROM u.created_at)::int AS month,
      COUNT(*)::int AS count
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE u.institution_id = ${institutionId}
      AND (
        (${roleName} = 'Student' AND r.name = 'Student')
        OR
        (${roleName} = 'Faculty' AND r.name LIKE 'Faculty%')
      )
    GROUP BY month
    ORDER BY month;
  `;

  const history = buildMonthlySeries(monthly);

  const last = history.length > 0 ? history[history.length - 1] : 0;
  const prev = history.length > 1 ? history[history.length - 2] : 0;

  const percentageChange = prev > 0 ? ((last - prev) / prev) * 100 : 0;

  return {
    total: history.reduce((a, b) => a + b, 0),
    percentageChange: Number(percentageChange.toFixed(1)),
    trend: last >= prev ? 'up' : 'down',
    history,
  };
}


/**
 * ─────────────────────────────────────────────
 * DASHBOARD KPI CARDS
 * ─────────────────────────────────────────────
 */
export async function getStudentDashboardStats(prisma: PrismaClient, institutionId: number) {
  return getUserDashboardStats(prisma, institutionId, 'Student');
}

export async function getFacultyDashboardStats(prisma: PrismaClient, institutionId: number) {
  return getUserDashboardStats(prisma, institutionId, 'Faculty');
}

export async function getAssessmentDashboardStats(prisma: PrismaClient, institutionId: number) {
  const monthly = await prisma.$queryRaw<{ month: number; count: number }[]>`
    SELECT
      EXTRACT(YEAR FROM created_at)::int * 100 +
      EXTRACT(MONTH FROM created_at)::int AS month,
      COUNT(*)::int AS count
    FROM assessments
    WHERE institution_id = ${institutionId}
      AND is_deleted = false
    GROUP BY month
    ORDER BY month;
  `;

  const history = buildMonthlySeries(monthly);

  const last = history.length > 0 ? history[history.length - 1] : 0;
  const prev = history.length > 1 ? history[history.length - 2] : 0;

  const percentageChange = prev > 0 ? ((last - prev) / prev) * 100 : 0;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const dueToday = await prisma.assessments.count({
    where: {
      institution_id: institutionId,
      is_deleted: false,
      end_time: { gte: startOfToday, lte: endOfToday },
      status: { in: ['published', 'active'] },
    },
  });

  return {
    total: history.reduce((a, b) => a + b, 0),
    percentageChange: Number(percentageChange.toFixed(1)),
    trend: last >= prev ? 'up' : 'down',
    history,
    dueToday,
  };
}

/**
 * ─────────────────────────────────────────────
 * ACADEMIC PERFORMANCE
 * ─────────────────────────────────────────────
 */
export async function getAvgAcademicPerformance(prisma: PrismaClient, institutionId: number) {
  const MIN_REQUIRED_PERCENTAGE = 75;

  const latestAttempts = await prisma.$queryRaw<{ student_id: bigint; percentage: number }[]>`
    SELECT DISTINCT ON (aa.student_id)
      aa.student_id,
      aa.percentage
    FROM assessment_attempts aa
    JOIN users u ON u.id = aa.student_id
    WHERE u.institution_id = ${institutionId}
      AND aa.status = 'evaluated'
      AND aa.percentage IS NOT NULL
    ORDER BY aa.student_id, aa.created_at DESC
  `;

  if (latestAttempts.length === 0) {
    return {
      averagePercentage: 0,
      minimumRequired: MIN_REQUIRED_PERCENTAGE,
      highPerformers: 0,
      atRiskStudents: 0,
    };
  }

  let total = 0;
  let highPerformers = 0;
  let atRiskStudents = 0;

  for (const a of latestAttempts) {
    total += a.percentage;
    a.percentage >= MIN_REQUIRED_PERCENTAGE ? highPerformers++ : atRiskStudents++;
  }

  return {
    averagePercentage: Number((total / latestAttempts.length).toFixed(1)),
    minimumRequired: MIN_REQUIRED_PERCENTAGE,
    highPerformers,
    atRiskStudents,
  };
}

/**
 * ─────────────────────────────────────────────
 * PLACEMENT READINESS
 * ─────────────────────────────────────────────
 */
export async function getPlacementReadinessOverview(prisma: PrismaClient, institutionId: number) {
  const THRESHOLD = 75;

  const attempts = await prisma.$queryRaw<{ percentage: number }[]>`
    SELECT DISTINCT ON (aa.student_id)
      aa.percentage
    FROM assessment_attempts aa
    JOIN users u ON u.id = aa.student_id
    WHERE u.institution_id = ${institutionId}
      AND aa.status = 'evaluated'
      AND aa.percentage IS NOT NULL
    ORDER BY aa.student_id, aa.created_at DESC
  `;

  let ready = 0;
  let notReady = 0;

  for (const a of attempts) {
    a.percentage >= THRESHOLD ? ready++ : notReady++;
  }

  return {
    threshold: THRESHOLD,
    ready: {
      totalStudents: ready,
      description: `${ready} students scoring above the required threshold`,
    },
    notReady: {
      totalStudents: notReady,
      description: `${notReady} students requiring significant support`,
    },
  };
}

/**
 * ─────────────────────────────────────────────
 * ACADEMIC PERFORMANCE BY DEPARTMENT
 * ─────────────────────────────────────────────
 */
export async function getAcademicPerformanceByDepartment(
  prisma: PrismaClient,
  institutionId: number
) {
  const MIN_SCORE = 75;

  const rows = await prisma.$queryRaw<{ department_name: string; percentage: number }[]>`
    SELECT DISTINCT ON (aa.student_id)
      r.name AS department_name,
      aa.percentage
    FROM assessment_attempts aa
    JOIN users u ON u.id = aa.student_id
    JOIN batch_students bs ON bs.student_id = u.id
    JOIN batches b ON b.id = bs.batch_id
    JOIN roles r ON r.id = b.department_role_id
    WHERE u.institution_id = ${institutionId}
      AND aa.status = 'evaluated'
      AND aa.percentage IS NOT NULL
    ORDER BY aa.student_id, aa.created_at DESC
  `;

  const map = new Map<string, { total: number; count: number }>();

  for (const r of rows) {
    if (!map.has(r.department_name)) {
      map.set(r.department_name, { total: 0, count: 0 });
    }
    const d = map.get(r.department_name)!;
    d.total += r.percentage;
    d.count++;
  }

  const departments = [];
  let above = 0;
  let below = 0;
  let highest: { name: string; avg: number } | null = null;

  for (const [name, d] of map) {
    const avg = Number((d.total / d.count).toFixed(1));
    avg >= MIN_SCORE ? above++ : below++;

    if (!highest || avg > highest.avg) {
      highest = { name, avg };
    }

    departments.push({
      department: name,
      averagePercentage: avg,
      meetsRequirement: avg >= MIN_SCORE,
    });
  }

  return {
    minimumScore: MIN_SCORE,
    summary: {
      totalDepartments: departments.length,
      aboveRequirement: above,
      belowRequirement: below,
    },
    departments,
    highestDepartment: highest ? { name: highest.name, averagePercentage: highest.avg } : null,
    insights: {
      needsIntervention: departments.filter((d) => !d.meetsRequirement).map((d) => d.department),
      consistentlyAbove: departments.filter((d) => d.meetsRequirement).map((d) => d.department),
    },
  };
}
