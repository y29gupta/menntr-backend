import { PrismaClient, AttemptStatus } from '@prisma/client';

export async function getStudentDashboard(
  prisma: PrismaClient,
  studentId: bigint,
  institutionId: number
) {
  const now = new Date();

  /* =====================================================
     🗓 CURRENT WEEK RANGE
     ===================================================== */

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  /* =====================================================
     1️⃣ FIND STUDENT ACTIVE BATCH
     ===================================================== */

  const batchRecord = await prisma.batch_students.findFirst({
    where: {
      student_id: studentId,
      is_active: true,
    },
    select: {
      batch_id: true,
    },
  });

  if (!batchRecord) {
    return {
      pending: 0,
      completed: 0,
      cgpa: 0,
      currentRank: null,
      totalStudents: 0,
    };
  }

  const batchId = batchRecord.batch_id;

  /* =====================================================
     2️⃣ PENDING (DUE THIS WEEK ONLY)
     ===================================================== */

  const pending = await prisma.assessments.count({
    where: {
      institution_id: institutionId,
      status: { in: ['published', 'active'] },
      end_time: {
        gte: startOfWeek,
        lte: endOfWeek,
      },
      batches: {
        some: {
          batch_id: batchId,
        },
      },
      attempts: {
        none: {
          student_id: studentId,
          status: {
            in: ['submitted', 'evaluated'],
          },
        },
      },
    },
  });

  /* =====================================================
     3️⃣ COMPLETED
     ===================================================== */

  const completed = await prisma.assessment_attempts.count({
    where: {
      student_id: studentId,
      status: {
        in: ['submitted', 'evaluated'],
      },
      assessment: {
        institution_id: institutionId,
      },
    },
  });

  /* =====================================================
     4️⃣ CGPA (Average Percentage)
     ===================================================== */

  const cgpaAgg = await prisma.assessment_attempts.aggregate({
    where: {
      student_id: studentId,
      status: 'evaluated',
      percentage: {
        not: null,
      },
    },
    _avg: {
      percentage: true,
    },
  });

  const cgpaRaw = Number(cgpaAgg._avg.percentage ?? 0);

  // Convert to 10 scale if needed (UI shows 7.5 / 10)
  const cgpa = Number((cgpaRaw / 10).toFixed(2));

  /* =====================================================
     5️⃣ RANK IN BATCH (BASED ON AVG %)
     ===================================================== */

  const studentsInBatch = await prisma.batch_students.findMany({
    where: {
      batch_id: batchId,
      is_active: true,
    },
    select: {
      student_id: true,
    },
  });

  const studentIds = studentsInBatch.map((s) => s.student_id);

  const ranking = await prisma.assessment_attempts.groupBy({
    by: ['student_id'],
    where: {
      student_id: { in: studentIds },
      status: 'evaluated',
    },
    _avg: {
      percentage: true,
    },
    orderBy: {
      _avg: {
        percentage: 'desc',
      },
    },
  });

  const totalStudents = ranking.length;

  const rankIndex = ranking.findIndex((r) => r.student_id === studentId);

  const currentRank = rankIndex >= 0 ? rankIndex + 1 : null;

  return {
    pending,
    completed,
    cgpa,
    currentRank,
    totalStudents,
  };
}

export async function getStudentAssessmentLists(
  prisma: PrismaClient,
  studentId: bigint,
  institutionId: number
) {
  const now = new Date();

  /* =====================================================
     🗓 CURRENT WEEK RANGE
     ===================================================== */

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  /* =====================================================
     FIND STUDENT ACTIVE BATCH
     ===================================================== */

  const batchRecord = await prisma.batch_students.findFirst({
    where: {
      student_id: studentId,
      is_active: true,
    },
    select: {
      batch_id: true,
    },
  });

  if (!batchRecord) {
    return { pending: [], ongoing: [], upcoming: [] };
  }

  const batchId = batchRecord.batch_id;

  /* =====================================================
     FETCH ASSIGNED ASSESSMENTS
     ===================================================== */

  const assessments = await prisma.assessments.findMany({
    where: {
      institution_id: institutionId,
      is_deleted: false,
      status: { in: ['published', 'active'] },
      batches: {
        some: { batch_id: batchId },
      },
    },
    include: {
      attempts: {
        where: { student_id: studentId },
        orderBy: { attempt_number: 'desc' },
        take: 1,
      },
    },
  });

  const pending: any[] = [];
  const ongoing: any[] = [];
  const upcoming: any[] = [];

  for (const assessment of assessments) {
    const latestAttempt = assessment.attempts[0];

    const hasSubmitted = latestAttempt && ['submitted', 'evaluated'].includes(latestAttempt.status);

    if (hasSubmitted) continue;

    const isExpired = assessment.end_time && assessment.end_time < now;

    if (isExpired) continue;

    const isStarted = assessment.start_time && assessment.start_time <= now;

    const isUpcoming = assessment.start_time && assessment.start_time > now;

    const endsThisWeek =
      assessment.end_time && assessment.end_time >= startOfWeek && assessment.end_time <= endOfWeek;

    const baseData = {
      id: assessment.id.toString(),
      title: assessment.title,
      durationMinutes: assessment.duration_minutes,
      type: (assessment.metadata as any)?.question_type ?? 'MCQ',
      startTime: assessment.start_time,
      endTime: assessment.end_time,
    };

    /* =====================================================
       🔶 PENDING → ENDING THIS WEEK
       ===================================================== */
    if (endsThisWeek) {
      pending.push({
        ...baseData,
        status: 'pending',
      });
      continue;
    }

    /* =====================================================
       🟢 ONGOING → STARTED, NOT EXPIRED, NOT THIS WEEK
       ===================================================== */
    if (isStarted && !endsThisWeek) {
      const remainingMs = assessment.end_time
        ? assessment.end_time.getTime() - now.getTime()
        : null;

      ongoing.push({
        ...baseData,
        status: 'ongoing',
        remainingTimeMs: remainingMs,
      });
      continue;
    }

    /* =====================================================
       🔵 UPCOMING → START DATE IN FUTURE
       ===================================================== */
    if (isUpcoming) {
      upcoming.push({
        ...baseData,
        status: 'upcoming',
      });
    }
  }

  return {
    pending,
    ongoing,
    upcoming,
  };
}

export async function getStudentPlacementReadiness(
  prisma: PrismaClient,
  studentId: bigint,
  institutionId: number
) {
  /* =====================================================
     1️⃣ GET ALL EVALUATED ATTEMPTS
     ===================================================== */

  const attempts = await prisma.assessment_attempts.findMany({
    where: {
      student_id: studentId,
      status: 'evaluated',
      assessment: {
        institution_id: institutionId,
      },
    },
    include: {
      assessment: true,
    },
    orderBy: {
      created_at: 'asc',
    },
  });

  if (!attempts.length) {
    return {
      readinessScore: 0,
      targetReadiness: 75,
      strengths: [],
      needsImprovement: [],
      criticalGaps: [],
      assessments: [],
    };
  }

  /* =====================================================
     2️⃣ PLACEMENT READINESS SCORE
     ===================================================== */

  const avgPercentage =
    attempts.reduce((sum, a) => sum + Number(a.percentage || 0), 0) / attempts.length;

  const readinessScore = Number(avgPercentage.toFixed(2));

  /* =====================================================
     3️⃣ SKILL GAP ANALYSIS (BASED ON TAGS)
     ===================================================== */

  const attemptIds = attempts.map((a) => a.id);

  const answers = await prisma.attempt_answers.findMany({
    where: {
      attempt_id: { in: attemptIds },
    },
    include: {
      question: true,
    },
  });

  const tagPerformance: Record<string, { total: number; correct: number }> = {};

  for (const ans of answers) {
    const tags = ans.question.tags || [];

    for (const tag of tags) {
      if (!tagPerformance[tag]) {
        tagPerformance[tag] = { total: 0, correct: 0 };
      }

      tagPerformance[tag].total += 1;

      if (ans.is_correct) {
        tagPerformance[tag].correct += 1;
      }
    }
  }

  const strengths: string[] = [];
  const needsImprovement: string[] = [];
  const criticalGaps: string[] = [];

  for (const tag in tagPerformance) {
    const { total, correct } = tagPerformance[tag];
    const percent = (correct / total) * 100;

    if (percent >= 75) {
      strengths.push(tag);
    } else if (percent >= 50) {
      needsImprovement.push(tag);
    } else {
      criticalGaps.push(tag);
    }
  }

  /* =====================================================
     4️⃣ ASSESSMENT WISE PERFORMANCE
     ===================================================== */

  const assessments = attempts.map((a) => {
    const result =
      Number(a.score_obtained) >= Number(a.assessment.passing_marks || 0) ? 'Passed' : 'Failed';

    return {
      assessmentId: a.assessment_id.toString(),
      assessmentName: a.assessment.title,
      score: Number(a.percentage || 0),
      timeTakenMinutes: Math.floor((a.time_taken_seconds || 0) / 60),
      attempts: a.attempt_number,
      result,
    };
  });

  return {
    readinessScore,
    targetReadiness: 75,
    strengths,
    needsImprovement,
    criticalGaps,
    assessments,
  };
}
