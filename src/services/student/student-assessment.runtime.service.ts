import { PrismaClient, AttemptStatus, CodeSubmissionStatus } from '@prisma/client';
import axios from 'axios';
import { runOnJudge } from '../judge/judge.client';

type JudgeStatus = 'accepted' | 'runtime_error' | 'wrong_answer';

type JudgeResult = {
  status: JudgeStatus;
  passed: number;
  total: number;
  outputs: string[];
};

/* ---------------- RUNTIME CONFIG ---------------- */
export async function getRuntimeConfig(prisma: PrismaClient, input: any) {
  const session = await prisma.assessment_sessions.findFirst({
    where: { assessment_id: input.assessment_id, student_id: input.student_id, is_active: true },
    include: { assessment: true, attempt: true },
  });

  if (!session || session.attempt.status !== AttemptStatus.in_progress) {
    throw new Error('Assessment not active');
  }

  const totalQuestions = await prisma.assessment_questions.count({
    where: { assessment_id: session.assessment_id },
  });

  return {
    duration_minutes: session.assessment.duration_minutes,
    allow_backtrack: session.assessment.allow_backtrack,
    allow_question_skip: session.assessment.allow_question_skip,
    shuffle_questions: session.assessment.shuffle_questions,
    shuffle_options: session.assessment.shuffle_options,
    auto_submit: session.assessment.auto_submit,
    end_time: session.assessment.end_time,
    total_questions: totalQuestions,
  };
}

/* ---------------- GET QUESTION (FIXED) ---------------- */
export async function getQuestion(prisma: PrismaClient, input: any) {
  const session = await prisma.assessment_sessions.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      is_active: true,
    },
  });

  if (!session) throw new Error('Session not found');

  const questions = await prisma.assessment_questions.findMany({
    where: { assessment_id: input.assessment_id },
    include: {
      question: {
        include: { options: true },
      },
    },
    orderBy: { sort_order: 'asc' },
  });

  const aq = questions[input.index];
  if (!aq) throw new Error('Invalid question');

  const answer = await prisma.attempt_answers.findFirst({
    where: {
      attempt_id: session.attempt_id,
      assessment_question_id: aq.id,
    },
  });

  const q = aq.question;
  const meta = (q.metadata ?? {}) as any;

  // ---------------- CODING QUESTION ----------------
  if (q.question_type === 'coding') {
    const lastSubmission = await prisma.coding_submissions.findFirst({
      where: {
        attempt_id: session.attempt_id,
        question_id: q.id,
      },
      orderBy: { submitted_at: 'desc' },
    });

    return {
      index: input.index,
      assessment_question_id: aq.id.toString(),
      question_id: q.id.toString(),
      type: 'coding',

      title: q.question_text,
      description: q.question_text,

      constraints: meta.constraints ?? null,
      examples: meta.sample_test_cases ?? [],

      marks: aq.points,

      supported_languages: meta.supported_languages,
      starter_code: meta.starter_code ?? {},

      previous_code: lastSubmission?.source_code ?? null,
      previous_language: lastSubmission?.language ?? null,

      is_flagged: answer?.is_flagged ?? false,
    };
  }

  // ---------------- MCQ QUESTION ----------------
  return {
    index: input.index,
    assessment_question_id: aq.id.toString(),
    question_id: q.id.toString(),
    type: q.question_type,
    question_text: q.question_text,
    marks: aq.points,
    options: q.options.map((o) => ({
      id: o.id.toString(),
      label: o.option_label,
      text: o.option_text,
    })),
    previous_answer: answer?.selected_option_ids ?? [],
    is_flagged: answer?.is_flagged ?? false,
  };
}

/* ---------------- MCQ AUTOSAVE ---------------- */
// export async function saveMcqAnswer(prisma: PrismaClient, input: any) {
//   const session = await prisma.assessment_sessions.findFirst({
//     where: { assessment_id: input.assessment_id, student_id: input.student_id, is_active: true },
//   });
//   if (!session) throw new Error('Session not found');
//   await prisma.attempt_answers.upsert({
//     where: {
//       attempt_id_assessment_question_id: {
//         attempt_id: session!.attempt_id,
//         assessment_question_id: input.assessment_question_id,
//       },
//     },
//     update: {
//       selected_option_ids: input.selected_option_ids,
//       answered_at: new Date(),
//     },
//     create: {
//       attempt_id: session!.attempt_id,
//       assessment_question_id: input.assessment_question_id,
//       question_id: input.question_id,
//       selected_option_ids: input.selected_option_ids,
//       answered_at: new Date(),
//     },
//   });

//   return { success: true };
// }
export async function saveMcqAnswer(prisma: PrismaClient, input: any) {
  const session = await prisma.assessment_sessions.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      is_active: true,
    },
  });
  if (!session) throw new Error('Session not found');

  const aq = await prisma.assessment_questions.findUnique({
    where: {
      assessment_id_question_id: {
        assessment_id: input.assessment_id,
        question_id: input.question_id,
      },
    },
    include: { question: { include: { options: true } } },
  });
  if (!aq) throw new Error('Assessment question not found');

  const correctOptionIds = aq.question.options
    .filter((o) => o.is_correct)
    .map((o) => o.id.toString());

  const selected = input.selected_option_ids.map(String);

  const isCorrect =
    selected.length === correctOptionIds.length &&
    selected.every((id: any) => correctOptionIds.includes(id));

  const pointsEarned = isCorrect ? aq.points : -aq.negative_points;

  await prisma.attempt_answers.upsert({
    where: {
      attempt_id_assessment_question_id: {
        attempt_id: session.attempt_id,
        assessment_question_id: aq.id,
      },
    },
    update: {
      selected_option_ids: input.selected_option_ids,
      is_correct: isCorrect,
      points_earned: pointsEarned,
      answered_at: new Date(),
    },
    create: {
      attempt_id: session.attempt_id,
      assessment_question_id: aq.id,
      question_id: input.question_id,
      selected_option_ids: input.selected_option_ids,
      is_correct: isCorrect,
      points_earned: pointsEarned,
      answered_at: new Date(),
    },
  });

  await prisma.assessment_attempts.update({
    where: { id: session.attempt_id },
    data: {
      answered_questions: { increment: 1 },
      correct_answers: isCorrect ? { increment: 1 } : undefined,
      wrong_answers: !isCorrect ? { increment: 1 } : undefined,
      score_obtained: { increment: pointsEarned },
    },
  });

  return {
    success: true,
    is_correct: isCorrect,
    points_earned: pointsEarned,
    max_points: aq.points,
  };
}

/* ---------------- RUN CODING (STUB) ---------------- */
export async function runCoding(prisma: PrismaClient, input: any) {
  const question = await prisma.question_bank.findUnique({
    where: { id: input.question_id },
  });

  if (!question) throw new Error('Question not found');

  const meta = question.metadata as any;
  const testCases = meta.sample_test_cases.slice(0, 2);

  const result = await runOnJudge({
    language: input.language,
    code: input.source_code,
    testCases,
  });

  return result;
}

/* ---------------- SAVE CODING ---------------- */
export async function saveCodingSubmission(prisma: PrismaClient, input: any) {
  const session = await prisma.assessment_sessions.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      is_active: true,
    },
  });

  if (!session) throw new Error('Session not found');

  const aq = await prisma.assessment_questions.findFirst({
    where: {
      assessment_id: input.assessment_id,
      question_id: input.question_id,
    },
  });
  if (!aq) throw new Error('Assessment question not found');

  const maxPoints = aq.points;

  const question = await prisma.question_bank.findUnique({
    where: { id: input.question_id },
  });

  if (!question) throw new Error('Question not found');

  const meta = question.metadata as any;
  const testCases = meta.sample_test_cases;

  // 🔥 RUN JUDGE (FINAL)
  const judgeResult = (await runOnJudge({
    language: input.language,
    code: input.source_code,
    testCases,
  })) as JudgeResult;

  const statusMap: Record<JudgeStatus, CodeSubmissionStatus> = {
    accepted: CodeSubmissionStatus.accepted,
    runtime_error: CodeSubmissionStatus.runtime_error,
    wrong_answer: CodeSubmissionStatus.wrong_answer,
  };

  const finalStatus = statusMap[judgeResult.status] ?? CodeSubmissionStatus.runtime_error;

  const pointsEarned =
    judgeResult.total > 0 ? (judgeResult.passed / judgeResult.total) * maxPoints : 0;

  // 🔥 STORE FINAL RESULT
  const submission = await prisma.coding_submissions.create({
    data: {
      attempt_id: session.attempt_id,
      question_id: input.question_id,
      student_id: input.student_id,

      language: input.language,
      source_code: input.source_code,

      status: finalStatus,
      test_cases_passed: judgeResult.passed,
      total_test_cases: judgeResult.total,

      points_earned: pointsEarned,
      max_points: maxPoints,

      test_results: judgeResult.outputs,
      is_final_submission: true,
    },
  });

  await prisma.assessment_attempts.update({
    where: {
      id: session.attempt_id,
    },
    data: {
      answered_questions: { increment: 1 },
      score_obtained: { increment: pointsEarned },
    },
  });
  return {
    success: true,
    submission_id: submission.id.toString(),
    status: finalStatus,
    passed: judgeResult.passed,
    total: judgeResult.total,
    pointsEarned: pointsEarned,
    maxPoints: maxPoints,
  };
}

/* ---------------- FLAG QUESTION ---------------- */
export async function flagQuestion(prisma: PrismaClient, input: any) {
  const session = await prisma.assessment_sessions.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
      is_active: true,
    },
  });

  await prisma.attempt_answers.updateMany({
    where: {
      attempt_id: session!.attempt_id,
      assessment_question_id: input.assessment_question_id,
    },
    data: { is_flagged: input.is_flagged },
  });

  return { success: true };
}

/* ---------------- SUBMIT PREVIEW (FINAL FIX) ---------------- */
export async function getSubmitPreview(prisma: PrismaClient, input: any) {
  const attempt = await prisma.assessment_attempts.findFirst({
    where: {
      assessment_id: input.assessment_id,
      student_id: input.student_id,
    },
    include: {
      assessment: true,
      answers: true,
      coding_submissions: true,
    },
  });

  if (!attempt) throw new Error('Attempt not found');

  const assessment = attempt.assessment;

  const totalQuestions = await prisma.assessment_questions.count({
    where: { assessment_id: input.assessment_id },
  });

  // ---------------- ATTENDED COUNT ----------------
  const mcqAnswered = new Set(attempt.answers.map((a) => a.assessment_question_id.toString()));

  const codingAnswered = new Set(attempt.coding_submissions.map((c) => c.question_id.toString()));

  const attended = new Set([...mcqAnswered, ...codingAnswered]).size;

  // ---------------- TIME CALCULATION ----------------
  let timeTakenMinutes: number;

  if (attempt.status === AttemptStatus.evaluated && attempt.time_taken_seconds) {
    // 🔒 LOCKED TIME (POST SUBMIT)
    timeTakenMinutes = Math.ceil(attempt.time_taken_seconds / 60);
  } else {
    // ⏳ LIVE TIMER (DURING EXAM)
    const now = Date.now();
    const start = attempt.started_at.getTime();
    const maxMs = assessment.duration_minutes * 60 * 1000;

    const elapsedMs = Math.min(now - start, maxMs);
    timeTakenMinutes = Math.ceil(elapsedMs / (1000 * 60));
  }


  return {
    attended,
    unanswered: Math.max(totalQuestions - attended, 0),
    time_taken_minutes: timeTakenMinutes,
  };
}

/* ---------------- FINAL SUBMIT ---------------- */
export async function submitAssessment(prisma: PrismaClient, input: any) {
  const attempt = await prisma.assessment_attempts.findFirst({
    where: { assessment_id: input.assessment_id, student_id: input.student_id },
    include: {
      answers: true,
      coding_submissions: true,
      assessment: {
        include: {
          questions: true,
        },
      },
    },
  });
  if (!attempt) throw new Error('Attempt not found');

  // If already submitted (DO NOT RECALCULATE)
  if(attempt.status === AttemptStatus.evaluated) {
    return {
      success: true,
      submission: {
        attended: attempt.answered_questions,
        unanswered: attempt.assessment.questions.length - attempt.answered_questions,
        time_taken_minutes: Math.ceil((attempt.time_taken_seconds ?? 0) / 60),
      },
      message: 'Assessment already submitted',
      show_feedback: true,
    };
  }
  // TOTAL SCORE (max possible)
  const totalScore = attempt.assessment.questions.reduce((s, q) => s + q.points, 0);

  // OBTAINED SCORE
  const mcqScore = attempt.answers.reduce((s, a) => s + Number(a.points_earned ?? 0), 0);

  const codingScore = attempt.coding_submissions.reduce(
    (s, c) => s + Number(c.points_earned ?? 0),
    0
  );

  const scoreObtained = mcqScore + codingScore;

  // PERCENTAGE
  const percentage = totalScore > 0 ? (scoreObtained / totalScore) * 100 : 0;

  // TIME TAKEN
  const endTime = new Date();
  const timeTakenSeconds = Math.floor((endTime.getTime() - attempt.started_at.getTime()) / 1000);

  await prisma.assessment_attempts.update({
    where: { id: attempt!.id },
    data: {
      status: AttemptStatus.evaluated,
      submitted_at: new Date(),
      time_taken_seconds: timeTakenSeconds,
      score_obtained: scoreObtained,
      total_score: totalScore,
      percentage,
    },
  });

  await prisma.assessment_sessions.updateMany({
    where: { attempt_id: attempt!.id },
    data: { is_active: false, ended_at: new Date() },
  });

  return {
    success: true,
    submission: {
      attended: attempt.answered_questions,
      unanswered: attempt.assessment.questions.length - attempt.answered_questions,
      time_taken_minutes: Math.ceil(timeTakenSeconds / 60),
    },
    message: 'Assessment submitted successfully',
    show_feedback: true,
  };

}
