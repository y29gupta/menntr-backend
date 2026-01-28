// services/candidate-report.service.ts
import { PrismaClient } from '@prisma/client';

export async function getCandidateReport(
  prisma: PrismaClient,
  assessmentId: bigint,
  attemptId: bigint,
  institutionId: number
) {
  const attempt = await prisma.assessment_attempts.findFirst({
    where: {
      id: attemptId,
      assessment_id: assessmentId,
      assessment: {
        institution_id: institutionId,
      },
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
                  options: {
                    orderBy: { sort_order: 'asc' },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          assessment_question: {
            sort_order: 'asc',
          },
        },
      },
    },
  });

  if (!attempt) {
    throw new Error('Attempt not found or forbidden');
  }

  const totalQuestions = attempt.answers.length;
  const correct = attempt.answers.filter((a) => a.is_correct).length;

  /* -------------------------------
     QUESTION WISE PERFORMANCE
  -------------------------------- */
  const questionWise = attempt.answers.map((ans, index) => {
    const q = ans.assessment_question.question;
    const meta = q.metadata as any;

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
              submittedCode: meta?.submitted_code ?? null,
              testCasesPassed: meta?.test_cases_passed ?? null,
              totalTestCases: meta?.total_test_cases ?? null,
              executionTime: meta?.execution_time ?? null,
            }
          : null,
    };
  });

  /* -------------------------------
     PROCTORING INSIGHTS
  -------------------------------- */
  const integrity = {
    tabSwitches: attempt.tab_switches,
    violations: Array.isArray(attempt.violations) ? attempt.violations.length : 0,
  };

  /* -------------------------------
     FINAL RESPONSE (UI MATCHED)
  -------------------------------- */
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
      correctAnswers: correct,
      totalQuestions,
      timeTakenMinutes: Math.round((attempt.time_taken_seconds ?? 0) / 60),
    },

    questionWisePerformance: questionWise,

    proctoringInsights: integrity,
  };
}
