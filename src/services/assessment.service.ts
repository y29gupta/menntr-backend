import { PrismaClient, AssessmentStatus, QuestionDifficulty, QuestionType } from '@prisma/client';
import { timeAgo } from '../utils/time';
import { capitalize, formatQuestionType } from '../utils/assessments/formatQuestionType';

/* -------------------------------
   CREATE
-------------------------------- */
export interface AssessmentMetaData {
  category: string;
  assessment_type: string;
  question_type: string;
}
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

    category: string;
    assessment_type: string;
    question_type: string;
  }
) {
  return prisma.assessments.create({
    data: {
      title: data.title,
      description: data.description,
      duration_minutes: data.duration_minutes,
      tags: data.tags ?? [],
      status: AssessmentStatus.draft,

      metadata: {
        category: data.category,
        assessment_type: data.assessment_type,
        question_type: data.question_type,
      },

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

export async function getAssessmentSummary(
  prisma: PrismaClient,
  assessmentId: bigint
) {
  const assessment = await prisma.assessments.findUnique({
    where: { id: assessmentId },
    include: {
      questions: {
        include: {
          question: true,
        },
      },
    },
  });

  if (!assessment) {
    throw new Error('Assessment not found');
  }

  const questions = assessment.questions;

  const totalQuestions = questions.length;

  const totalMarks = questions.reduce(
    (sum, q) => sum + q.points,
    0
  );

  const difficultyMix: Record<QuestionDifficulty, number> = {
    easy: 0,
    medium: 0,
    hard: 0,
    expert: 0,
  };

  questions.forEach(q => {
    difficultyMix[q.question.difficulty_level]++;
  });

  const mandatoryCount = questions.filter(q => q.is_mandatory).length;
  const metadata = assessment.metadata as AssessmentMetaData | null;
  return {
    assessmentName: assessment.title,
    category: metadata?.category ?? null,
    assessmentType: metadata?.assessment_type ?? null,
    questionType: metadata?.question_type ?? null,

    totalQuestions,
    totalMarks,

    difficultyMix: {
      easy: difficultyMix.easy,
      medium: difficultyMix.medium,
      hard: difficultyMix.hard,
    },

    mandatory: mandatoryCount === totalQuestions,
  };
}


/* -------------------------------
   SCHEDULE & PUBLISH
-------------------------------- */

export async function scheduleAssessment(
  prisma: PrismaClient,
  assessmentId: bigint,
  body: { publish_at: string; expiry_at?: string }
) {
  await prisma.assessments.update({
    where: { id: assessmentId },
    data: {
      start_time: new Date(body.publish_at),
      end_time: body.expiry_at ? new Date(body.expiry_at) : null,
    },
  });
}


export async function publishAssessment(
  prisma: PrismaClient,
  assessmentId: bigint
) {
  const assessment = await prisma.assessments.findUnique({
    where: { id: assessmentId },
    include: {
      questions: true,
      batches: true,
    },
  });

  if (!assessment) throw new Error('Assessment not found');
  if (assessment.questions.length === 0) throw new Error('No questions');
  if (assessment.batches.length === 0) throw new Error('No audience');
  if (!assessment.start_time) throw new Error('Publish time not set');

  return prisma.assessments.update({
    where: { id: assessmentId },
    data: {
      status: AssessmentStatus.published,
      published_at: new Date(),
      // ⚠️ DO NOT TOUCH ACCESS FLAGS HERE
    },
  });
}



/* -------------------------------
   LIST & GET
-------------------------------- */

export async function listAssessments(
  prisma: PrismaClient,
  institutionId: number,
  tab: 'active' | 'draft' | 'closed'
) {
  let statusFilter: any = {};
  

  if(tab === 'active') {
    statusFilter = {status: {in:['published', 'active']}};
  }
  if(tab === 'draft') {
    statusFilter = {status: 'draft'};
  }
  if(tab === 'closed') {
    statusFilter = {status: {in: ['closed', 'archived']}};
  }
  const assessments = await prisma.assessments.findMany({
    where: {
      institution_id: institutionId,
      // is_deleted: false,
      ...statusFilter,
    },
    include: {
      questions: true, // for count
      batches: {
        include: {
          batch: true, // department / batch name
        },
      },
    },
    orderBy: {
      updated_at: 'desc',
    },
  });

  return assessments.map(a => {
    const metadata = a.metadata as AssessmentMetaData | null;

    return {
      id: a.id.toString(),

      // UI columns
      assessmentName: a.title,
      category: metadata?.category ?? '-',

      departmentBatch:
        a.batches.length > 0
          ? a.batches.map(b => b.batch.name).join(', ')
          : '-',

      questions: a.questions.length,

      publishedOn: a.published_at
        ? a.published_at.toISOString().split('T')[0]
        : '-',

      expiryOn: a.end_time
        ? a.end_time.toISOString().split('T')[0]
        : '-',

      // lastEdited: a.updated_at
      //   ? `${Math.max(
      //       1,
      //       Math.floor(
      //         (Date.now() - a.updated_at.getTime()) / (1000 * 60 * 60 * 24)
      //       )
      //     )} days ago`
      //   : '-',
      lastEdited: a.updated_at ? timeAgo(a.updated_at) : '-',

      status: a.status,
    };
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
    topic: string;
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
      tags: [body.topic], // 🔥 IMPORTANT for UI topic display
    },
  });

  // 2️⃣ Create Options
  await prisma.question_options.createMany({
    data: body.options.map((opt, index) => ({
      question_id: question.id,
      option_text: opt.option_text,
      option_label: String.fromCharCode(65 + index),
      is_correct: opt.is_correct,
      sort_order: index,
    })),
  });

  // 3️⃣ Attach to Assessment
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



export async function getAssessmentAudienceMeta(
  prisma: PrismaClient,
  institutionId: number
) {
  // 1️⃣ Fetch all batches with role info
  const batches = await prisma.batches.findMany({
    where: {
      institution_id: institutionId,
      is_active: true,
    },
    include: {
      category_role: true,
      department_role: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  /**
   * Build structure:
   * Category → Department → Batches
   */
  const categoryMap = new Map<number, any>();

  for (const batch of batches) {
    if (!batch.category_role || !batch.department_role) continue;

    // CATEGORY
    if (!categoryMap.has(batch.category_role.id)) {
      categoryMap.set(batch.category_role.id, {
        id: batch.category_role.id,
        name: batch.category_role.name,
        departments: new Map<number, any>(),
      });
    }

    const category = categoryMap.get(batch.category_role.id);

    // DEPARTMENT
    if (!category.departments.has(batch.department_role.id)) {
      category.departments.set(batch.department_role.id, {
        id: batch.department_role.id,
        name: batch.department_role.name,
        batches: [],
      });
    }

    const department = category.departments.get(batch.department_role.id);

    // BATCH
    department.batches.push({
      id: batch.id,
      name: batch.name,
      academicYear: batch.academic_year,
      semester: batch.semester,
    });
  }

  // Convert Maps → Arrays
  return {
    institutionCategories: Array.from(categoryMap.values()).map(cat => ({
      id: cat.id,
      name: cat.name,
      departments: Array.from(cat.departments.values()),
    })),
  };
}

export async function listAssessmentQuestions(
  prisma: PrismaClient,
  assessmentId: bigint
) {
  const rows = await prisma.assessment_questions.findMany({
    where: { assessment_id: assessmentId },
    orderBy: { added_at: 'asc' },
    include: {
      question: {
        select: {
          question_text: true,
          difficulty_level: true,
          question_type: true,
          tags: true,
        },
      },
    },
  });

  return rows.map((row, index) => ({
    id: row.id.toString(),
    questionNo: index + 1,
    questionText: row.question.question_text,
    marks: row.points,
    isMandatory: row.is_mandatory,
    topic: row.question.tags?.[0] ?? 'General',
    questionTypeLabel: formatQuestionType(row.question.question_type),
    difficulty: capitalize(row.question.difficulty_level),
  }));
}




export async function getAssessmentAudience(
  prisma: PrismaClient,
  assessmentId: bigint
) {
  const rows = await prisma.assessment_batches.findMany({
    where: { assessment_id: assessmentId },
    include: {
      batch: {
        include: {
          category_role: true,
          department_role: true,
        },
      },
    },
  });

  if (rows.length === 0) {
    return null;
  }

  return {
    institutionCategory: rows[0].batch.category_role?.name ?? '-',
    department: rows[0].batch.department_role?.name ?? '-',
    batches: rows.map(r => r.batch.name),
  };
}


export async function updateAssessmentAccess(
  prisma: PrismaClient,
  assessmentId: bigint,
  body: {
    shuffle_questions: boolean;
    shuffle_options: boolean;
    allow_reattempts: boolean;
    show_correct_answers: boolean;
    show_score_immediate: boolean;
  }
) {
  await prisma.assessments.update({
    where: { id: assessmentId },
    data: {
      shuffle_questions: body.shuffle_questions,
      shuffle_options: body.shuffle_options,
      show_correct_answers: body.show_correct_answers,
      show_results_immediate: body.show_score_immediate,
      max_attempts: body.allow_reattempts ? 3 : 1,
    },
  });
}


export async function getAssessmentAccess(
  prisma: PrismaClient,
  assessmentId: bigint
) {
  const assessment = await prisma.assessments.findUnique({
    where: { id: assessmentId },
    select: {
      shuffle_questions: true,
      shuffle_options: true,
      max_attempts: true,
      show_correct_answers: true,
      show_results_immediate: true,
    },
  });

  if (!assessment) {
    throw new Error('Assessment not found');
  }

  return {
    shuffleQuestions: assessment.shuffle_questions,
    shuffleOptions: assessment.shuffle_options,
    allowReattempts: assessment.max_attempts > 1,
    showCorrectAnswers: assessment.show_correct_answers,
    showScoreImmediately: assessment.show_results_immediate,
  };
}

export async function deleteAssessment(
  prisma: PrismaClient,
  assessmentId: bigint,
  institutionId: number
) {
  const assessment = await prisma.assessments.findUnique({
    where: { id: assessmentId },
    include: {
      questions: true,
      batches: true,
      attempts: true,
    },
  });
  console.log("harish logs", assessment?.institution_id, institutionId)
  if (!assessment) throw new Error('Assessment not found');

  if (assessment.institution_id !== institutionId) throw new Error('Forbidden');

  if (assessment.status !== 'draft') throw new Error('Only draft assessments can be deleted');

  if (assessment.questions.length > 0) throw new Error('Cannot delete assessment with questions');

  if (assessment.batches.length > 0) throw new Error('Cannot delete assessment with audience');

  if (assessment.attempts.length > 0) throw new Error('Cannot delete assessment with attempts');

  await prisma.assessments.update({
    where: { id: assessmentId },
    data: { is_deleted: true },
  });
}
