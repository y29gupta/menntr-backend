import { PrismaClient, AssessmentStatus, QuestionDifficulty, QuestionType } from '@prisma/client';

/* -------------------------------
   CREATE
-------------------------------- */

export async function createAssessment(
  prisma: PrismaClient,
  data: {
    institution_id: number;
    feature_id: number;
    title: string;
    description?: string;
    duration_minutes: number;
    created_by: bigint;
    tags?: string[];
  }
) {
  return prisma.assessments.create({
    data: {
      title: data.title,
      description: data.description,
      duration_minutes: data.duration_minutes,
      tags: data.tags ?? [],
      status: AssessmentStatus.draft,

      institution: { connect: { id: data.institution_id } },
      feature: { connect: { id: data.feature_id } },
      creator: { connect: { id: data.created_by } },
    },
  });
}

/* -------------------------------
   AUDIENCE
-------------------------------- */

export async function assignAudience(
  prisma: PrismaClient,
  assessmentId: bigint,
  batchIds: number[],
  userId: bigint
) {
  for (const batchId of batchIds) {
    await prisma.assessment_batches.upsert({
      where: {
        assessment_id_batch_id: {
          assessment_id: assessmentId,
          batch_id: batchId,
        },
      },
      update: {},
      create: {
        assessment_id: assessmentId,
        batch_id: batchId,
        assigned_by: userId,
      },
    });
  }
}

/* -------------------------------
   QUESTIONS
-------------------------------- */

export async function addQuestion(prisma: PrismaClient, assessmentId: bigint, body: any) {
  return prisma.assessment_questions.create({
    data: {
      assessment_id: assessmentId,
      question_id: body.question_id,
      points: body.points,
      negative_points: body.negative_points ?? 0,
      is_mandatory: body.is_mandatory ?? true,
      sort_order: body.sort_order ?? 0,
      section_name: body.section_name,
    },
  });
}

export async function bulkAddQuestions(
  prisma: PrismaClient,
  assessmentId: bigint,
  questionIds: bigint[]
) {
  let count = 0;
  for (const qid of questionIds) {
    await prisma.assessment_questions.create({
      data: {
        assessment_id: assessmentId,
        question_id: qid,
        points: 1,
      },
    });
    count++;
  }
  return { added: count };
}

/* -------------------------------
   SUMMARY
-------------------------------- */

export async function getAssessmentSummary(prisma: PrismaClient, assessmentId: bigint) {
  const questions = await prisma.assessment_questions.findMany({
    where: { assessment_id: assessmentId },
    include: { question: true },
  });

  const totalQuestions = questions.length;
  const totalMarks = questions.reduce((s, q) => s + q.points, 0);

   const difficultyMix: Record<QuestionDifficulty, number> = {
    easy: 0,
    medium: 0,
    hard: 0,
    expert: 0,
  };
  questions.forEach(q => {
    difficultyMix[q.question.difficulty_level]++;
  });

  return {
    totalQuestions,
    totalMarks,
    difficultyMix,
    mandatoryCount: questions.filter(q => q.is_mandatory).length,
  };
}

/* -------------------------------
   SCHEDULE & PUBLISH
-------------------------------- */

export async function scheduleAssessment(
  prisma: PrismaClient,
  assessmentId: bigint,
  body: { start_time: string; end_time: string }
) {
  await prisma.assessments.update({
    where: { id: assessmentId },
    data: {
      start_time: new Date(body.start_time),
      end_time: new Date(body.end_time),
    },
  });
}

export async function publishAssessment(prisma: PrismaClient, assessmentId: bigint) {
  return prisma.assessments.update({
    where: { id: assessmentId },
    data: {
      status: AssessmentStatus.published,
      published_at: new Date(),
    },
  });
}

/* -------------------------------
   LIST & GET
-------------------------------- */

export async function listAssessments(prisma: PrismaClient, institutionId: number) {
  return prisma.assessments.findMany({
    where: { institution_id: institutionId },
    orderBy: { created_at: 'desc' },
  });
}

export async function getAssessment(prisma: PrismaClient, assessmentId: bigint) {
  return prisma.assessments.findUnique({
    where: { id: assessmentId },
    include: {
      questions: { include: { question: { include: { options: true } } } },
      batches: { include: { batch: true } },
    },
  });
}

export async function createMCQQuestion(
  prisma: PrismaClient,
  assessmentId: bigint,
  institutionId: number,
  createdBy: bigint,
  body: {
    question_text: string;
    difficulty_level: QuestionDifficulty;
    question_type: QuestionType;
    points: number;
    is_mandatory?: boolean;
    options: { option_text: string; is_correct: boolean }[];
  }
) {
  // 1️⃣ Create Question
  const question = await prisma.question_bank.create({
    data: {
      institution_id: institutionId,
      created_by: createdBy,
      question_text: body.question_text,
      difficulty_level: body.difficulty_level,
      question_type: body.question_type,
      default_points: body.points,
      tags: [],
    },
  });

  // 2️⃣ Create Options
  await prisma.question_options.createMany({
    data: body.options.map((opt, index) => ({
      question_id: question.id,
      option_text: opt.option_text,
      option_label: String.fromCharCode(65 + index), // A, B, C, D
      is_correct: opt.is_correct,
      sort_order: index,
    })),
  });

  // 3️⃣ Attach Question to Assessment
  await prisma.assessment_questions.create({
    data: {
      assessment_id: assessmentId,
      question_id: question.id,
      points: body.points,
      is_mandatory: body.is_mandatory ?? true,
    },
  });

  return {
    success: true,
    question_id: question.id.toString(),
  };
}

