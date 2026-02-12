import { PrismaClient } from '@prisma/client';
import { getPagination, buildPaginatedResponse } from '../utils/pagination';

export async function getAssessmentPerformanceOverview(
  prisma: PrismaClient,
  assessmentId: bigint,
  institutionId: number
) {
  const assessment = await prisma.assessments.findFirst({
    where: {
      id: assessmentId,
      institution_id: institutionId,
      is_deleted: false,
    },
    select: {
      id: true,
      status: true,
      duration_minutes: true,
    },
  });

  if (!assessment) {
    throw new Error('Assessment not found or forbidden');
  }

  if (!['published', 'active', 'closed', 'archived'].includes(assessment.status)) {
    throw new Error('Performance available only for active or completed assessments');
  }

  const totalAssigned = await prisma.batch_students.count({
    where: {
      batch: {
        assessment_batches: {
          some: {assessment_id: assessmentId},
        },
      },
      is_active: true,
     },
  });

  const attempts = await prisma.assessment_attempts.findMany({
    where: {
      assessment_id: assessmentId,
    },
    select: {
      status: true,
      percentage: true,
      time_taken_seconds: true,
    },
  });

  const attempted = attempts.length;
  const completed = attempts.filter((a) => a.status === 'submitted' || a.status === 'evaluated');

  const avgScore =
    completed.reduce((s, a) => s + Number(a.percentage ?? 0), 0) / (completed.length || 1);

  const avgTime =
    completed.reduce((s, a) => s + (a.time_taken_seconds ?? 0), 0) / (completed.length || 1);

  const distribution = { '0-30': 0, '31-60': 0, '61-100': 0 };

  completed.forEach((a) => {
    const p = Number(a.percentage ?? 0);
    if (p <= 30) distribution['0-30']++;
    else if (p <= 60) distribution['31-60']++;
    else distribution['61-100']++;
  });

  return {
    metrics: {
      attemptRate: Math.round((attempted / (totalAssigned || 1)) * 100),
      averageScore: Math.round(avgScore),
      averageTimeMinutes: Math.round(avgTime / 60),
      completionRate: Math.round((completed.length / (attempted || 1)) * 100),
    },
    scoreDistribution: distribution,
    totalStudents: totalAssigned,
  };
}

export async function getQuestionWisePerformance(
  prisma: PrismaClient,
  assessmentId: bigint,
  institutionId: number
) {
  const assessment = await prisma.assessments.findFirst({
    where: { id: assessmentId, institution_id: institutionId },
    select: { id: true },
  });

  if (!assessment) {
    throw new Error('Assessment not found or forbidden');
  }

  const questions = await prisma.assessment_questions.findMany({
    where: { assessment_id: assessmentId },
    include: {
      question: { select: { difficulty_level: true, question_type: true } },
      attempt_answers: {
        select: {
          is_correct: true,
          time_taken_seconds: true,
        },
      },
    },
    orderBy: {sort_order: 'asc'},
  });

  // Fetch All Coding submissions in one shot
  const codingSubmissions = await prisma.coding_submissions.findMany({
    where: {
      question_id: {
        in: questions.map((q) => q.question_id),
      },
      is_final_submission: true,
    },
    select: {
      question_id: true,
      status: true,
    },
  });

  // Group coding submissions by question_id
  const codingMap = new Map<string, {total: number; accepted: number}>();

  for(const sub of codingSubmissions) {
    const key = sub.question_id.toString();

    if(!codingMap.has(key)) {
      codingMap.set(key, {total: 0, accepted: 0});
    }

    const entry = codingMap.get(key)!;
    entry.total += 1;

    if(sub.status === 'accepted') {
      entry.accepted += 1;
    }
  }

  // Final response
  return questions.map((q, index) => {
    let total = 0;
    let correct = 0;
    let avgTime = 0;

    if (q.question.question_type === 'coding') {
      const stat = codingMap.get(q.question_id.toString());
      total = stat?.total ?? 0;
      correct = stat?.accepted ?? 0;
    } else {
      total = q.attempt_answers.length;
      correct = q.attempt_answers.filter((a) => a.is_correct).length;

      avgTime =
        q.attempt_answers.reduce((s, a) => s + (a.time_taken_seconds ?? 0), 0) / (total || 1);
    }

    return {
      questionNo: index + 1,
      accuracy: Math.round((correct / (total || 1)) * 100),
      avgTimeSeconds: Math.round(avgTime),
      difficulty: q.question.difficulty_level ?? 'medium',
    };
  });
}

export async function getCandidatePerformance(
  prisma: PrismaClient,
  assessmentId: bigint,
  institutionId: number,
  query: {
    page?: number;
    limit?: number;
    search?: string;
    attempt?: number;
  }
) {
  const { skip, limit, page } = getPagination(query);

  // 🔹 Get available attempts
  const availableAttempts = await prisma.assessment_attempts.findMany({
    where: { assessment_id: assessmentId },
    select: { attempt_number: true },
    distinct: ['attempt_number'],
    orderBy: { attempt_number: 'asc' },
  });
  console.log("available", availableAttempts)
  if (availableAttempts.length === 0) {
    return buildPaginatedResponse([], 0, page, limit);
  }

  // 🔹 Default attempt = lowest attempt number
  const selectedAttempt = query.attempt ?? availableAttempts[0].attempt_number;
  console.log("selected", selectedAttempt)
  const where: any = {
    assessment_id: assessmentId,
    attempt_number: Number(selectedAttempt),
    student: {
      institution_id: institutionId,
    },
    status: {
    in: ['submitted', 'evaluated'],
  }
  };
  console.log("where", where)
  if (query.search) {
    where.student.OR = [
      { first_name: { contains: query.search, mode: 'insensitive' } },
      { email: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.assessment_attempts.findMany({
      where,
      skip,
      take: limit,
      include: {
        student: {
          select: {
            first_name: true,
            last_name: true,
            email: true,
            avatar_url: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.assessment_attempts.count({ where }),
  ]);

  return {
    attempt: selectedAttempt,
    attemptsAvailable: availableAttempts.map((a) => a.attempt_number),
    ...buildPaginatedResponse(
      rows.map((r) => ({
        studentId: r.student_id,
        attemptId: r.id,
        studentName: `${r.student.first_name ?? ''} ${r.student.last_name ?? ''}`,
        email: r.student.email,
        durationMinutes: Math.round((r.time_taken_seconds ?? 0) / 60),
        score: `${r.score_obtained}/${r.total_score}`,
        percentage: Math.round(Number(r.percentage ?? 0)),
        status: r.status,
      })),
      total,
      page,
      limit
    ),
  };
}

export async function getStudentAttemptSummary(
  prisma: PrismaClient,
  assessmentId: bigint,
  studentId: bigint,
  attemptId: bigint,
  institutionId: number
) {
  const attempt = await prisma.assessment_attempts.findFirst({
    where: {
      id: attemptId,
      assessment_id: assessmentId,
      student_id: studentId,
      assessment: { institution_id: institutionId },
    },
    include: {
      student: true,
    },
  });

  if (!attempt) {
    throw new Error('Attempt not found or forbidden');
  }

  return {
    student: {
      name: `${attempt.student.first_name ?? ''} ${attempt.student.last_name ?? ''}`,
      email: attempt.student.email,
    },
    attempt: {
      attemptNumber: attempt.attempt_number,
      status:
        attempt.status === 'submitted' || attempt.status === 'evaluated'
          ? 'Completed'
          : 'In Progress',
      startDateTime: attempt.started_at,
      endDateTime: attempt.submitted_at,
      durationMinutes: Math.round((attempt.time_taken_seconds ?? 0) / 60),
    },
    performance: {
      score: `${attempt.score_obtained}/${attempt.total_score}`,
      percentage: Math.round(Number(attempt.percentage ?? 0)),
    },
  };
}

export async function getStudentSectionPerformance(
  prisma: PrismaClient,
  assessmentId: bigint,
  studentId: bigint,
  attemptId: bigint,
  institutionId: number
) {
  const attempt = await prisma.assessment_attempts.findFirst({
    where: {
      id: attemptId,
      assessment_id: assessmentId,
      student_id: studentId,
      assessment: { institution_id: institutionId },
    },
    select: { id: true },
  });

  if (!attempt) {
    throw new Error('Attempt not found or forbidden');
  }

  const answers = await prisma.attempt_answers.findMany({
    where: { attempt_id: attemptId },
    include: {
      assessment_question: {
        select: { section_name: true, points: true },
      },
    },
  });

  const sectionMap = new Map<string, { score: number; total: number }>();

  for (const a of answers) {
    const section = a.assessment_question.section_name ?? 'General';

    if (!sectionMap.has(section)) {
      sectionMap.set(section, { score: 0, total: 0 });
    }

    const s = sectionMap.get(section)!;
    s.total += a.assessment_question.points;
    s.score += Number(a.points_earned ?? 0);
  }

  return Array.from(sectionMap.entries()).map(([section, v]) => ({
    section,
    score: `${v.score}/${v.total}`,
    accuracy: v.total === 0 ? '-' : `${Math.round((v.score / v.total) * 100)}%`,
  }));
}

export async function getStudentIntegrity(
  prisma: PrismaClient,
  assessmentId: bigint,
  studentId: bigint,
  attemptId: bigint,
  institutionId: number
) {
  const attempt = await prisma.assessment_attempts.findFirst({
    where: {
      id: attemptId,
      assessment_id: assessmentId,
      student_id: studentId,
      assessment: { institution_id: institutionId },
    },
    select: {
      violations: true,
      tab_switches: true,
    },
  });

  if (!attempt) {
    throw new Error('Attempt not found or forbidden');
  }

  return {
    violations: Array.isArray(attempt.violations) ? attempt.violations.length : 0,
    interruptions: attempt.tab_switches,
  };
}

export async function getAssessmentAttemptNumbers(
  prisma: PrismaClient,
  assessmentId: bigint,
  institutionId: number
) {
  const assessment = await prisma.assessments.findFirst({
    where: {
      id: assessmentId,
      institution_id: institutionId,
      is_deleted: false,
    },
    select: { id: true },
  });

  if (!assessment) {
    throw new Error('Assessment not found or forbidden');
  }

  const attempts = await prisma.assessment_attempts.findMany({
    where: { assessment_id: assessmentId },
    select: { attempt_number: true },
    distinct: ['attempt_number'],
    orderBy: { attempt_number: 'asc' },
  });

  return {
    attempts: attempts.map((a) => a.attempt_number),
  };
}
export async function getStudentQuestionDetails(
  prisma: PrismaClient,
  assessmentId: bigint,
  studentId: bigint,
  attemptId: bigint,
  institutionId: number
) {
  /* =====================================================
     1️⃣ VALIDATE ATTEMPT
     ===================================================== */

  const attempt = await prisma.assessment_attempts.findFirst({
    where: {
      id: attemptId,
      assessment_id: assessmentId,
      student_id: studentId,
      assessment: {
        institution_id: institutionId,
      },
    },
    select: { id: true },
  });

  if (!attempt) {
    throw new Error('Attempt not found or forbidden');
  }

  /* =====================================================
     2️⃣ FETCH ALL ASSESSMENT QUESTIONS
     ===================================================== */

  const assessmentQuestions = await prisma.assessment_questions.findMany({
    where: { assessment_id: assessmentId },
    include: {
      question: {
        include: {
          options: true,
        },
      },
    },
    orderBy: { sort_order: 'asc' },
  });

  /* =====================================================
     3️⃣ FETCH STUDENT ANSWERS
     ===================================================== */

  const answers = await prisma.attempt_answers.findMany({
    where: { attempt_id: attemptId },
  });

  const answerMap = new Map<string, (typeof answers)[0]>();

  for (const ans of answers) {
    answerMap.set(ans.assessment_question_id.toString(), ans);
  }

  /* =====================================================
     4️⃣ FETCH CODING SUBMISSIONS
     ===================================================== */

  const codingSubmissions = await prisma.coding_submissions.findMany({
    where: {
      attempt_id: attemptId,
      is_final_submission: true,
    },
  });

  const codingMap = new Map<string, any>();

  for (const sub of codingSubmissions) {
    codingMap.set(sub.question_id.toString(), sub);
  }

  /* =====================================================
     5️⃣ BUILD FULL RESPONSE (ALL QUESTIONS)
     ===================================================== */

  return assessmentQuestions.map((aq, index) => {
    const question = aq.question;
    const questionId = question.id.toString();
    const ans = answerMap.get(aq.id.toString());
    const isCoding = question.question_type === 'coding';

    /* -------------------------------
       MCQ QUESTIONS
    -------------------------------- */

    if (!isCoding) {
      const correctOptions = question.options.filter((o) => o.is_correct).map((o) => o.option_text);

      const selectedOptions = ans
        ? question.options
            .filter((o) => ans.selected_option_ids.includes(o.id))
            .map((o) => o.option_text)
        : [];

      return {
        questionNo: index + 1,
        questionId,
        questionText: question.question_text,
        marks: aq.points,
        type: question.question_type,
        difficulty: question.difficulty_level,

        candidateResponse: selectedOptions,
        correctAnswer: correctOptions,

        resultStatus: ans ? (ans.is_correct ? 'Correct' : 'Wrong') : 'Not Attempted',

        score: ans ? `${ans.points_earned}/${aq.points}` : `0/${aq.points}`,
      };
    }

    /* -------------------------------
       CODING QUESTIONS
    -------------------------------- */

    const submission = codingMap.get(questionId);

    return {
      questionNo: index + 1,
      questionId,
      questionText: question.question_text,
      marks: aq.points,
      type: 'coding',
      difficulty: question.difficulty_level,

      submittedCode: submission?.source_code ?? null,
      language: submission?.language ?? null,

      testCasesPassed: submission
        ? `${submission.test_cases_passed}/${submission.total_test_cases}`
        : null,

      executionTimeSeconds: submission?.execution_time_ms
        ? submission.execution_time_ms / 1000
        : null,

      resultStatus: submission
        ? submission.status === 'accepted'
          ? 'Correct'
          : 'Wrong'
        : 'Not Attempted',

      score: submission ? `${submission.points_earned}/${submission.max_points}` : `0/${aq.points}`,
    };
  });
}