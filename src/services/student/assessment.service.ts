import { PrismaClient } from '@prisma/client';

export async function getStudentAssessmentResult(
  prisma: PrismaClient,
  assessmentId: bigint,
  studentId: bigint,
  institutionId: number
) {
  /* =====================================================
     1️⃣ GET LATEST EVALUATED ATTEMPT
     ===================================================== */

  const attempt = await prisma.assessment_attempts.findFirst({
    where: {
      assessment_id: assessmentId,
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
      attempt_number: 'desc',
    },
  });

  if (!attempt) {
    throw new Error('Result not found');
  }

  /* =====================================================
     2️⃣ FETCH ANSWERS WITH QUESTION TAGS
     ===================================================== */

  const answers = await prisma.attempt_answers.findMany({
    where: {
      attempt_id: attempt.id,
    },
    include: {
      question: true,
    },
  });

  /* =====================================================
     3️⃣ BASIC METRICS
     ===================================================== */

  const totalQuestions = attempt.total_questions;
  const correctAnswers = attempt.correct_answers;
  const percentage = Number(attempt.percentage || 0);
  const scoreObtained = Number(attempt.score_obtained);
  const totalScore = Number(attempt.total_score);
  const timeTakenMinutes = Math.floor((attempt.time_taken_seconds || 0) / 60);

  const status =
    scoreObtained >= Number(attempt.assessment.passing_marks || 0) ? 'Passed' : 'Failed';

  /* =====================================================
   SAFE METADATA EXTRACTION
   ===================================================== */

  const metadata =
    typeof attempt.assessment.metadata === 'object' &&
    attempt.assessment.metadata !== null &&
    !Array.isArray(attempt.assessment.metadata)
      ? (attempt.assessment.metadata as Record<string, any>)
      : {};

  const difficultyLevel = metadata.difficulty ?? 'Medium';

  /* =====================================================
     4️⃣ TOPIC PERFORMANCE
     ===================================================== */

  const topicMap: Record<string, { total: number; correct: number }> = {};

  for (const ans of answers) {
    const tags = ans.question.tags || [];

    for (const tag of tags) {
      if (!topicMap[tag]) {
        topicMap[tag] = { total: 0, correct: 0 };
      }

      topicMap[tag].total += 1;

      if (ans.is_correct) {
        topicMap[tag].correct += 1;
      }
    }
  }

  const topicPerformance = Object.entries(topicMap).map(([topic, data]) => {
    const percent = (data.correct / data.total) * 100;

    return {
      topic,
      percentage: Number(percent.toFixed(2)),
    };
  });

  /* =====================================================
     5️⃣ STRENGTHS & NEEDS IMPROVEMENT
     ===================================================== */

  const strengths = topicPerformance.filter((t) => t.percentage >= 75).map((t) => t.topic);

  const needsImprovement = topicPerformance.filter((t) => t.percentage < 60).map((t) => t.topic);

  /* =====================================================
     6️⃣ FEEDBACK GENERATOR
     ===================================================== */

  let feedback = '';

  if (percentage >= 80) {
    feedback = 'Excellent performance! You are placement ready. Keep refining advanced topics.';
  } else if (percentage >= 60) {
    feedback =
      'Good job! You’re performing above average. Focus on weak topics to improve readiness.';
  } else {
    feedback = 'You need improvement. Focus on fundamentals and practice consistently.';
  }

  /* =====================================================
     7️⃣ RETURN STRUCTURE (MATCHES UI)
     ===================================================== */

  return {
    assessmentId: assessmentId.toString(),
    assessmentName: attempt.assessment.title,
    submittedAt: attempt.submitted_at,

    overallPerformance: {
      score: scoreObtained,
      totalScore,
      percentage,
      status,
    },

    performanceSnapshot: {
      correctAnswers: `${correctAnswers}/${totalQuestions}`,
      accuracy: percentage,
      timeTakenMinutes,
      difficultyLevel: difficultyLevel || 'Medium',
    },

    topicPerformance,

    strengths,
    needsImprovement,

    feedback,
  };
}
