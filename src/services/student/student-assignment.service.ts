import { PrismaClient, AssignmentStatus, QuestionType } from '@prisma/client';

/* ======================================================
   LIST STUDENT ASSIGNMENTS
====================================================== */

export async function listStudentAssignments(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
  }
) {
  const now = new Date();

  // 🔹 Get student batch
  const batchStudent = await prisma.batch_students.findFirst({
    where: {
      student_id: input.student_id,
      is_active: true,
      batch: {
        institution_id: input.institution_id,
        is_active: true,
      },
    },
  });

  if (!batchStudent) {
    return {
      ongoing: [],
      upcoming: [],
      completed: [],
    };
  }

  // 🔹 Fetch all assignments for student batch
  const assignments = await prisma.assignments.findMany({
    where: {
      institution_id: input.institution_id,
      is_deleted: false,
      status: AssignmentStatus.published,
      batches: {
        some: { batch_id: batchStudent.batch_id },
      },
    },
    include: {
      attempts: {
        where: { student_id: input.student_id },
        orderBy: { attempt_number: 'desc' },
        take: 1,
      },
    },
  });

  const ongoing: any[] = [];
  const upcoming: any[] = [];
  const completed: any[] = [];

  for (const a of assignments) {
    const latestAttempt = a.attempts[0];

    const baseData = {
      id: a.id.toString(),
      title: a.title,
      publish_at: a.publish_at,
      expiry_at: a.expiry_at,
      total_marks: a.total_marks,
      attempt_status: latestAttempt?.status ?? 'not_started',
      score: latestAttempt?.score_obtained ?? null,
    };

    // 🔵 Upcoming
    if (a.publish_at && a.publish_at > now) {
      upcoming.push(baseData);
      continue;
    }

    // ⚪ Completed (submitted OR expired)
    if (latestAttempt?.status === 'submitted' || (a.expiry_at && a.expiry_at < now)) {
      completed.push(baseData);
      continue;
    }

    // 🟢 Ongoing
    if ((!a.publish_at || a.publish_at <= now) && (!a.expiry_at || a.expiry_at > now)) {
      ongoing.push(baseData);
    }
  }

  return {
    ongoing,
    upcoming,
    completed,
  };
}


/* ======================================================
   GET ASSIGNMENT DETAILS
====================================================== */

export async function getStudentAssignmentDetails(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assignment_id: bigint;
  }
) {
  const now = new Date();

  const assignment = await prisma.assignments.findFirst({
    where: {
      id: input.assignment_id,
      institution_id: input.institution_id,
      status: AssignmentStatus.published,
      is_deleted: false,
      publish_at: { lte: now },
    },
    include: {
      questions: {
        include: {
          question: {
            include: { options: true },
          },
        },
      },
    },
  });

  if (!assignment) {
    throw new Error('Assignment not available');
  }

  return {
    id: assignment.id.toString(),
    title: assignment.title,
    description: assignment.description,
    total_marks: assignment.total_marks,
    questions: assignment.questions.map((q, index) => ({
      assignment_question_id: q.id.toString(),
      question_id: q.question_id.toString(),
      question_no: index + 1,
      question_type: q.question.question_type,
      question_text: q.question.question_text,
      options:
        q.question.question_type === QuestionType.single_correct ||
        q.question.question_type === QuestionType.multiple_correct ||
        q.question.question_type === QuestionType.true_false
          ? q.question.options.map((opt) => ({
              id: opt.id.toString(),
              option_text: opt.option_text,
            }))
          : null,
      points: q.points,
    })),
  };
}

/* ======================================================
   START ASSIGNMENT
====================================================== */

export async function startAssignment(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assignment_id: bigint;
  }
) {
  const now = new Date();

  const assignment = await prisma.assignments.findFirst({
    where: {
      id: input.assignment_id,
      institution_id: input.institution_id,
      status: AssignmentStatus.published,
      is_deleted: false,
      publish_at: { lte: now },
      OR: [{ expiry_at: null }, { expiry_at: { gt: now } }],
    },
    include: {
      questions: true,
      attempts: {
        where: { student_id: input.student_id },
        orderBy: { attempt_number: 'desc' },
        take: 1,
      },
    },
  });

  if (!assignment) throw new Error('Assignment not available');

  const lastAttempt = assignment.attempts[0];

  if (lastAttempt && lastAttempt.status === 'in_progress') {
    return lastAttempt;
  }

  if (!assignment.allow_reattempts && lastAttempt) {
    throw new Error('Reattempt not allowed');
  }

  const attemptNumber = lastAttempt ? lastAttempt.attempt_number + 1 : 1;

  return prisma.assignment_attempts.create({
    data: {
      assignment_id: input.assignment_id,
      student_id: input.student_id,
      attempt_number: attemptNumber,
      status: 'in_progress',
      total_questions: assignment.questions.length,
      total_score: assignment.total_marks,
    },
  });
}

/* ======================================================
   SAVE ANSWER
====================================================== */

export async function saveAssignmentAnswer(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assignment_id: bigint;
    body: any;
  }
) {
  const attempt = await prisma.assignment_attempts.findFirst({
    where: {
      assignment_id: input.assignment_id,
      student_id: input.student_id,
      status: 'in_progress',
    },
  });

  if (!attempt) throw new Error('No active attempt');

  return prisma.assignment_answers.upsert({
    where: {
      attempt_id_assignment_question_id: {
        attempt_id: attempt.id,
        assignment_question_id: input.body.assignment_question_id,
      },
    },
    create: {
      attempt_id: attempt.id,
      assignment_question_id: input.body.assignment_question_id,
      question_id: input.body.question_id,
      selected_option_ids: input.body.selected_option_ids ?? [],
      text_answer: input.body.text_answer ?? null,
      file_url: input.body.file_url ?? null,
      language: input.body.language ?? null,
      source_code: input.body.source_code ?? null,
      answered_at: new Date(),
    },
    update: {
      selected_option_ids: input.body.selected_option_ids ?? [],
      text_answer: input.body.text_answer ?? null,
      file_url: input.body.file_url ?? null,
      language: input.body.language ?? null,
      source_code: input.body.source_code ?? null,
      answered_at: new Date(),
    },
  });
}

/* ======================================================
   SUBMIT ASSIGNMENT
====================================================== */

export async function submitAssignment(
  prisma: PrismaClient,
  input: {
    student_id: bigint;
    institution_id: number;
    assignment_id: bigint;
  }
) {
  const attempt = await prisma.assignment_attempts.findFirst({
    where: {
      assignment_id: input.assignment_id,
      student_id: input.student_id,
      status: 'in_progress',
    },
    include: {
      answers: true,
      assignment: {
        include: {
          questions: {
            include: {
              question: { include: { options: true } },
            },
          },
        },
      },
    },
  });

  if (!attempt) throw new Error('No active attempt');

  let totalScore = 0;
  let answeredCount = 0;

  for (const q of attempt.assignment.questions) {
    const answer = attempt.answers.find((a) => a.assignment_question_id === q.id);

    if (!answer) continue;

    answeredCount++;

    const question = q.question;

    if (
      question.question_type === QuestionType.single_correct ||
      question.question_type === QuestionType.multiple_correct ||
      question.question_type === QuestionType.true_false
    ) {
      const correct = question.options
        .filter((o) => o.is_correct)
        .map((o) => o.id.toString())
        .sort();

      const selected = (answer.selected_option_ids ?? []).map((id) => id.toString()).sort();

      if (JSON.stringify(correct) === JSON.stringify(selected)) {
        totalScore += q.points;
      }
    }
  }

  const percentage =
    attempt.total_score && Number(attempt.total_score) > 0
      ? (totalScore / Number(attempt.total_score)) * 100
      : 0;

  await prisma.assignment_attempts.update({
    where: { id: attempt.id },
    data: {
      status: 'submitted',
      submitted_at: new Date(),
      score_obtained: totalScore,
      answered_questions: answeredCount,
    },
  });

  return {
    success: true,
    score: totalScore,
    percentage: percentage.toFixed(2),
  };
}

/* ======================================================
   STUDENT OVERVIEW
====================================================== */

export async function getStudentAssignmentOverview(
  prisma: PrismaClient,
  studentId: bigint,
  institutionId: number
) {
  const attempts = await prisma.assignment_attempts.findMany({
    where: {
      student_id: studentId,
      assignment: { institution_id: institutionId },
      status: 'submitted',
    },
  });

  const total = attempts.length;

  const average =
    total > 0 ? attempts.reduce((sum, a) => sum + Number(a.score_obtained ?? 0), 0) / total : 0;

  return {
    total_attempts: total,
    average_score: average.toFixed(2),
  };
}
