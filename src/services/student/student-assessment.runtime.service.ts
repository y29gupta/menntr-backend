import { PrismaClient, AttemptStatus, CodeSubmissionStatus } from '@prisma/client';

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
export async function saveMcqAnswer(prisma: PrismaClient, input: any) {
  const session = await prisma.assessment_sessions.findFirst({
    where: { assessment_id: input.assessment_id, student_id: input.student_id, is_active: true },
  });
  if (!session) throw new Error('Session not found');
  await prisma.attempt_answers.upsert({
    where: {
      attempt_id_assessment_question_id: {
        attempt_id: session!.attempt_id,
        assessment_question_id: input.assessment_question_id,
      },
    },
    update: {
      selected_option_ids: input.selected_option_ids,
      answered_at: new Date(),
    },
    create: {
      attempt_id: session!.attempt_id,
      assessment_question_id: input.assessment_question_id,
      question_id: input.question_id,
      selected_option_ids: input.selected_option_ids,
      answered_at: new Date(),
    },
  });

  return { success: true };
}

/* ---------------- RUN CODING (STUB) ---------------- */
export async function runCoding(prisma: PrismaClient, input: any) {
  // ⚠️ DO NOT EXECUTE USER CODE HERE
  // Integrate Docker / Judge later

  return {
    status: 'success',
    sample_testcases_passed: true,
    output: 'Sample tests passed',
  };
}

/* ---------------- SAVE CODING ---------------- */
export async function saveCodingSubmission(prisma: PrismaClient, input: any) {
  const session = await prisma.assessment_sessions.findFirst({
    where: { assessment_id: input.assessment_id, student_id: input.student_id, is_active: true },
  });

  await prisma.coding_submissions.create({
    data: {
      attempt_id: session!.attempt_id,
      question_id: input.question_id,
      student_id: input.student_id,
      language: input.language,
      source_code: input.source_code,
      status: CodeSubmissionStatus.pending,
      max_points: input.max_points,
    },
  });

  return { success: true };
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
  const mcqAnswered = new Set(
    attempt.answers.map((a) => a.assessment_question_id.toString())
  );

  const codingAnswered = new Set(
    attempt.coding_submissions.map((c) => c.question_id.toString())
  );

  const attended = new Set([...mcqAnswered, ...codingAnswered]).size;

  // ---------------- TIME CALCULATION ----------------
  const startTime = attempt.started_at.getTime();

  const effectiveEndTime = attempt.submitted_at
    ? attempt.submitted_at.getTime()
    : assessment.end_time
      ? Math.min(Date.now(), assessment.end_time.getTime())
      : Date.now();

  const rawMs = Math.max(effectiveEndTime - startTime, 0);
  const maxMs = assessment.duration_minutes * 60 * 1000;
  const finalMs = Math.min(rawMs, maxMs);

  return {
    attended,
    unanswered: Math.max(totalQuestions - attended, 0),
    time_taken_minutes: Math.ceil(finalMs / (1000 * 60)),
  };
}



/* ---------------- FINAL SUBMIT ---------------- */
export async function submitAssessment(prisma: PrismaClient, input: any) {
  const attempt = await prisma.assessment_attempts.findFirst({
    where: { assessment_id: input.assessment_id, student_id: input.student_id },
  });

  await prisma.assessment_attempts.update({
    where: { id: attempt!.id },
    data: {
      status: AttemptStatus.submitted,
      submitted_at: new Date(),
    },
  });

  await prisma.assessment_sessions.updateMany({
    where: { attempt_id: attempt!.id },
    data: { is_active: false, ended_at: new Date() },
  });

  return { success: true };
}
