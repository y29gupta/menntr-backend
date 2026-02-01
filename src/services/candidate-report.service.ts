import { PrismaClient } from '@prisma/client';

export async function getCandidateReport(
  prisma: PrismaClient,
  assessmentId: bigint,
  attemptId: bigint,
  institutionId: number
) {
  const attempt = await prisma.assessment_attempts.findFirst({
    where: {
      id: attemptId, // ✅ bigint-safe
      assessment_id: assessmentId,
      assessment: { institution_id: institutionId },
    },
    include: {
      student: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          avatar_url: true,
        },
      },
      assessment: {
        select: {
          title: true,
          duration_minutes: true,
        },
      },
      answers: {
        include: {
          assessment_question: {
            include: {
              question: {
                include: {
                  options: { orderBy: { sort_order: 'asc' } },
                },
              },
            },
          },
        },
        orderBy: {
          assessment_question: { sort_order: 'asc' },
        },
      },
      coding_submissions: {
        where: { is_final_submission: true },
      },
    },
  });

  if (!attempt) throw new Error('Attempt not found or forbidden');

  /* ------------------ CODING MAP ------------------ */
  const codingMap = new Map<string, any>();
  for (const c of attempt.coding_submissions) {
    codingMap.set(c.question_id.toString(), c);
  }

  /* ---------------- QUESTION WISE ----------------- */
  const questionWise = attempt.answers.map((ans, index) => {
    const q = ans.assessment_question.question;
    const coding = codingMap.get(q.id.toString());

    return {
      questionNo: index + 1,
      questionId: q.id.toString(),
      type: q.question_type,
      difficulty: q.difficulty_level,
      marks: ans.assessment_question.points,
      timeTakenSeconds: ans.time_taken_seconds ?? 0,
      isCorrect: ans.is_correct,
      score: ans.points_earned,
      questionText: q.question_text,

      options:
        q.question_type !== 'coding'
          ? q.options.map((o) => ({
              id: o.id.toString(),
              text: o.option_text,
              isCorrect: o.is_correct,
              selected: ans.selected_option_ids.includes(o.id),
            }))
          : null,

      coding:
        q.question_type === 'coding'
          ? {
              language: coding?.language,
              sourceCode: coding?.source_code,
              status: coding?.status,
              testCasesPassed: coding?.test_cases_passed,
              totalTestCases: coding?.total_test_cases,
              executionTimeMs: coding?.execution_time_ms,
              errorMessage: coding?.error_message,
            }
          : null,
    };
  });

  /* ---------------- FINAL RESPONSE ---------------- */
  return {
    candidate: {
      id: attempt.student.id.toString(),
      name: `${attempt.student.first_name ?? ''} ${attempt.student.last_name ?? ''}`,
      email: attempt.student.email,
      avatar: attempt.student.avatar_url,
    },

    assessment: {
      title: attempt.assessment.title,
      durationMinutes: attempt.assessment.duration_minutes,
      attemptNumber: attempt.attempt_number,
      status: attempt.status,
    },

    overallScore: {
      percentage: Number(attempt.percentage ?? 0),
      score: `${attempt.score_obtained}/${attempt.total_score}`,
      timeTakenMinutes: Math.round((attempt.time_taken_seconds ?? 0) / 60),
    },

    questionWisePerformance: questionWise,

    proctoringInsights: {
      tabSwitches: attempt.tab_switches,
      violations: Array.isArray(attempt.violations) ? attempt.violations.length : 0,
    },
  };
}
