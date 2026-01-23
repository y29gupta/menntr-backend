import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { ConflictError } from '../utils/errors';
import { PrismaClient, AssessmentStatus, QuestionDifficulty, QuestionType } from '@prisma/client';
import { timeAgo } from '../utils/time';
import { capitalize, formatQuestionType } from '../utils/assessments/formatQuestionType';
import { findOrCreateQuestion } from './question.service';
import { buildPaginatedResponse, getPagination } from '../utils/pagination';


interface BulkUploadCodingInput {
  assessment_id: bigint;
  institution_id: number;
  created_by: bigint;
  fileName: string;
  buffer: Buffer;
}

/* -------------------------------
   CREATE
-------------------------------- */
interface CreateCodingQuestionBody {
  topic?: string | string[];
  problem_title: string;
  problem_statement: string;
  constraints: string;
  input_format: string;
  output_format: string;
  sample_test_cases: {
    input: string;
    output: string;
  }[];
  supported_languages: string[];
  difficulty_level: 'easy' | 'medium' | 'hard';
  points: number;
  time_limit_minutes: number;
  is_mandatory?: boolean;
}
export interface AssessmentMetaData {
  category: string;
  assessment_type: string;
  question_type: string;
}
export async function createAssessment(
  prisma: PrismaClient,
  data: {
    institution_id: number;
    feature_id: number; // ✅ internal only
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

      institution: {
        connect: { id: data.institution_id },
      },
      feature: {
        connect: { id: data.feature_id }, // 🔐 safe
      },
      creator: {
        connect: { id: data.created_by },
      },
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

  if (!assessment) throw new Error('Assessment not found');

  const questions = assessment.questions;

  let totalMarks = 0;

  const difficultyMix: Record<QuestionDifficulty, number> = {
    easy: 0,
    medium: 0,
    hard: 0,
    expert: 0,
  };

  let mcqCount = 0;
  let codingCount = 0;

  const supportedLanguages = new Set<string>();
  let codingTestCasesConfigured = true;

  let mandatoryCount = 0;

  for (const aq of questions) {
    const q = aq.question;
    totalMarks += aq.points;

    difficultyMix[q.difficulty_level]++;
    if (aq.is_mandatory) mandatoryCount++;

    const metadata = q.metadata as any;

    const isCoding = Boolean(metadata?.problem_statement);

    if (isCoding) {
      codingCount++;

      // Supported languages
      (metadata.supported_languages || []).forEach((l: string) => supportedLanguages.add(l));

      // Test case validation
      if (!metadata.sample_test_cases || metadata.sample_test_cases.length === 0) {
        codingTestCasesConfigured = false;
      }
    } else {
      mcqCount++;
    }
  }

  const meta = assessment.metadata as AssessmentMetaData | null;

  return {
    assessmentName: assessment.title,
    category: meta?.category ?? null,

    totalProblems: questions.length,
    totalMarks,
    durationMinutes: assessment.duration_minutes,

    difficultyMix: {
      easy: difficultyMix.easy,
      medium: difficultyMix.medium,
      hard: difficultyMix.hard,
    },

    questionBreakdown: {
      mcq: mcqCount,
      coding: codingCount,
    },

    supportedLanguages: Array.from(supportedLanguages),

    mandatory: mandatoryCount === questions.length,

    testCaseStatus: codingCount === 0 ? null : codingTestCasesConfigured ? 'Configured' : 'Missing',
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

export async function publishAssessment(prisma: PrismaClient, assessmentId: bigint) {
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
  params: {
    institution_id: number;
    tab: 'active' | 'draft' | 'closed';
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    category?: string;
  }
) {
  const { page, limit, skip } = getPagination(params);

  let statusFilter: any = {};
  if (params.tab === 'active') statusFilter = { status: { in: ['published', 'active'] } };
  if (params.tab === 'draft') statusFilter = { status: 'draft' };
  if (params.tab === 'closed') statusFilter = { status: { in: ['closed', 'archived'] } };

  const where: any = {
    institution_id: params.institution_id,
    is_deleted: false,
    ...statusFilter,
  };

  if (params.status) where.status = params.status;

  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: 'insensitive' } },
      { metadata: { path: ['category'], string_contains: params.search } },
      {
        batches: {
          some: {
            batch: { name: { contains: params.search, mode: 'insensitive' } },
          },
        },
      },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.assessments.findMany({
      where,
      skip,
      take: limit,
      include: {
        questions: true,
        batches: { include: { batch: true } },
      },
      orderBy: { updated_at: 'desc' },
    }),
    prisma.assessments.count({ where }),
  ]);

  return buildPaginatedResponse(rows, total, page, limit);
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
  const question = await findOrCreateQuestion(prisma,{
    
      institution_id: institutionId,
      created_by: createdBy,
      question_text: body.question_text,
      difficulty_level: body.difficulty_level,
      question_type: body.question_type,
      points: body.points,
      tags: [body.topic], // 🔥 IMPORTANT for UI topic display
      options: body.options,
    },
  );

  // 2️⃣ Create Options
  // await prisma.question_options.createMany({
  //   data: body.options.map((opt, index) => ({
  //     question_id: question.id,
  //     option_text: opt.option_text,
  //     option_label: String.fromCharCode(65 + index),
  //     is_correct: opt.is_correct,
  //     sort_order: index,
  //   })),
  // });

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

export async function getAssessmentAudienceMeta(prisma: PrismaClient, institutionId: number) {
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
  console.log('batches...', batches);
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
    institutionCategories: Array.from(categoryMap.values()).map((cat) => ({
      id: cat.id,
      name: cat.name,
      departments: Array.from(cat.departments.values()),
    })),
  };
}

export async function listAssessmentQuestions(prisma: PrismaClient, assessmentId: bigint) {
  const rows = await prisma.assessment_questions.findMany({
    where: { assessment_id: assessmentId },
    orderBy: { added_at: 'asc' },
    include: {
      question: true
      },
  });

  return rows.map((row, index) => ({
    assessment_question_id: row.id.toString(),
    question_id: row.question_id.toString(),
    questionNo: index + 1,
    questionText: row.question.question_text,
    marks: row.points,
    isMandatory: row.is_mandatory,
    topic: row.question.tags?.[0] ?? 'General',
    questionTypeLabel: formatQuestionType(row.question.question_type),
    difficulty: capitalize(row.question.difficulty_level),
  }));
}

export async function getAssessmentAudience(prisma: PrismaClient, assessmentId: bigint) {
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
    batches: rows.map((r) => r.batch.name),
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

export async function getAssessmentAccess(prisma: PrismaClient, assessmentId: bigint) {
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
  console.log('harish logs', assessment?.institution_id, institutionId);
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

export interface BulkUploadMcqInput {
  fileName: string;
  buffer: Buffer;
  institution_id: number;
  user_id: bigint;
}

export async function bulkUploadMcqs(
  prisma: PrismaClient,
  input: {
    fileName: string;
    buffer: Buffer;
    institution_id: number;
    user_id: bigint;
  }
) {
  let rows: any[] = [];

  // ------------------------
  // Parse file
  // ------------------------
  if (input.fileName.endsWith('.xlsx')) {
    const workbook = XLSX.read(input.buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet);
  } else if (input.fileName.endsWith('.csv')) {
    rows = parse(input.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } else {
    throw new ConflictError('Only CSV or Excel files are supported');
  }

  if (!rows.length) {
    throw new ConflictError('Uploaded file is empty');
  }

  const difficultyMap: Record<string, QuestionDifficulty> = {
    easy: 'easy',
    intermediate: 'medium',
    medium: 'medium',
    hard: 'hard',
    expert: 'expert',
  };

  let created = 0;
  let skipped = 0;

  // ------------------------
  // Insert / Reuse questions
  // ------------------------
  for (const row of rows) {
    const questionText = row['Question'];
    const topic = row['Question Topic'];
    const subTopic = row['Sub Topic'];
    const correctAnswer = row['Correct Answer'];
    const difficultyRaw = row['Difficulty Level']?.toLowerCase();
    const score = Number(row['Score']) || 1;

    const answers = [row['Answer 1'], row['Answer 2'], row['Answer 3'], row['Answer 4']];

    if (!questionText || !correctAnswer || answers.filter(Boolean).length < 2) {
      skipped++;
      continue;
    }

    // 🔑 SINGLE SOURCE OF TRUTH
    const question = await findOrCreateQuestion(prisma, {
      institution_id: input.institution_id,
      created_by: input.user_id,
      question_text: questionText,
      question_type: 'single_correct',
      difficulty_level: difficultyMap[difficultyRaw] ?? 'medium',
      points: score,
      tags: [topic, subTopic].filter(Boolean),
      metadata: {
        topic,
        sub_topic: subTopic,
      },
      options: answers
        .map((ans: string) =>
          ans
            ? {
                option_text: ans,
                is_correct: ans === correctAnswer,
              }
            : null
        )
        .filter(Boolean) as any[],
    });

    // If question already existed → skip count
    if (question.created_at.getTime() !== question.updated_at.getTime()) {
      skipped++;
    } else {
      created++;
    }
  }

  return {
    success: true,
    uploaded_questions: created,
    skipped_duplicates: skipped,
  };
}


export async function bulkCreateMcqForAssessment(
  prisma: PrismaClient,
  input: {
    assessment_id: bigint;
    institution_id: number;
    created_by: bigint;
    fileName: string;
    buffer: Buffer;
  }
) {
  let rows: any[] = [];

  // ------------------------
  // Parse file
  // ------------------------
  if (input.fileName.endsWith('.xlsx')) {
    const workbook = XLSX.read(input.buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet);
  } else if (input.fileName.endsWith('.csv')) {
    rows = parse(input.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } else {
    throw new Error('Only CSV or Excel files are supported');
  }

  if (!rows.length) {
    throw new Error('Uploaded file is empty');
  }

  const difficultyMap: Record<string, QuestionDifficulty> = {
    easy: 'easy',
    intermediate: 'medium',
    medium: 'medium',
    hard: 'hard',
    expert: 'expert',
  };

  let attached = 0;
  let skipped = 0;

  // ------------------------
  // Create / Attach questions
  // ------------------------
  for (const row of rows) {
    const questionText = row['Question'];
    const topic = row['Question Topic'];
    const subTopic = row['Sub Topic'];
    const correctAnswer = row['Correct Answer'];
    const score = Number(row['Score']) || 1;

    const answers = [row['Answer 1'], row['Answer 2'], row['Answer 3'], row['Answer 4']];

    if (!questionText || !correctAnswer || answers.filter(Boolean).length < 2) {
      skipped++;
      continue;
    }

    // 🔑 Reuse or create question
    const question = await findOrCreateQuestion(prisma, {
      institution_id: input.institution_id,
      created_by: input.created_by,
      question_text: questionText,
      question_type: 'single_correct',
      difficulty_level: difficultyMap[row['Difficulty Level']?.toLowerCase()] ?? 'medium',
      points: score,
      tags: [topic, subTopic].filter(Boolean),
      options: answers
        .map((ans: string) =>
          ans
            ? {
                option_text: ans,
                is_correct: ans === correctAnswer,
              }
            : null
        )
        .filter(Boolean) as any[],
    });

    // 🔒 Prevent duplicate attachment to same assessment
    await prisma.assessment_questions.upsert({
      where: {
        assessment_id_question_id: {
          assessment_id: input.assessment_id,
          question_id: question.id,
        },
      },
      update: {},
      create: {
        assessment_id: input.assessment_id,
        question_id: question.id,
        points: score,
        is_mandatory: true,
      },
    });

    attached++;
  }

  return {
    success: true,
    attached_questions: attached,
    skipped_duplicates: skipped,
  };
}


export async function createCodingQuestion(
  prisma: PrismaClient,
  assessmentId: bigint,
  institutionId: number,
  createdBy: bigint,
  body: CreateCodingQuestionBody
) {
  const question = await findOrCreateQuestion(prisma, {
    institution_id: institutionId,
    created_by: createdBy,
    question_text: body.problem_title,
    question_type: 'coding',
    difficulty_level: body.difficulty_level,
    points: body.points,
    tags: normalizeTags(body.topic),
    metadata: {
      problem_title: body.problem_title,
      problem_statement: body.problem_statement,
      constraints: body.constraints,
      input_format: body.input_format,
      output_format: body.output_format,
      sample_test_cases: body.sample_test_cases,
      supported_languages: body.supported_languages,
      time_limit_minutes: body.time_limit_minutes,
    },
  });

  await prisma.assessment_questions.create({
    data: {
      assessment_id: assessmentId,
      question_id: question.id,
      points: body.points,
      is_mandatory: body.is_mandatory ?? true,
    },
  });

  return { success: true, question_id: question.id.toString() };
}


export async function getMcqQuestionForEdit(
  prisma: PrismaClient,
  questionId: bigint,
  institutionId: number
) {
  const question = await prisma.question_bank.findUnique({
    where: { id: questionId },
    include: {
      options: {
        orderBy: { sort_order: 'asc' },
      },
    },
  });

  if (!question) throw new Error('Question not found');

  if (question.institution_id !== institutionId) {
    throw new Error('Forbidden');
  }

  if (
    question.question_type !== 'single_correct' &&
    question.question_type !== 'multiple_correct' &&
    question.question_type !== 'true_false'
  ) {
    throw new Error('Not an MCQ question');
  }

  return {
    id: question.id.toString(),
    topic: question.tags?.[0] ?? null,
    question_text: question.question_text,
    difficulty_level: question.difficulty_level,
    points: question.default_points,
    options: question.options.map((o) => ({
      id: o.id.toString(),
      option_text: o.option_text,
      is_correct: o.is_correct,
    })),
  };
}

export async function updateMcqQuestion(
  prisma: PrismaClient,
  questionId: bigint,
  institutionId: number,
  userId: bigint,
  body: {
    topic: string;
    question_text: string;
    difficulty_level: QuestionDifficulty;
    points: number;
    negative_points?: number;
    options: { option_text: string; is_correct: boolean }[];
  }
) {
  if (body.options.length < 2) {
    throw new Error('At least 2 options required');
  }

  const correctCount = body.options.filter((o) => o.is_correct).length;
  if (correctCount === 0) {
    throw new Error('At least one correct option required');
  }

  const question = await prisma.question_bank.findUnique({
    where: { id: questionId },
    include: {
      assessment_questions: {
        include: { assessment: true },
      },
    },
  });

  if (!question) throw new Error('Question not found');

  if (question.institution_id !== institutionId) {
    throw new Error('Forbidden');
  }

  // ❌ Block edit if assessment is published
  const linkedPublished = question.assessment_questions.some(
    (aq) => aq.assessment.status === 'published'
  );

  if (linkedPublished) {
    throw new Error('Cannot edit question used in published assessment');
  }

  // 🔒 Atomic update
  await prisma.$transaction(async (tx) => {
    // 1️⃣ Update question
    await tx.question_bank.update({
      where: { id: questionId },
      data: {
        question_text: body.question_text,
        difficulty_level: body.difficulty_level,
        default_points: body.points,
        tags: [body.topic],
        updated_at: new Date(),
      },
    });

    // 2️⃣ Delete old options
    await tx.question_options.deleteMany({
      where: { question_id: questionId },
    });

    // 3️⃣ Insert new options
    await tx.question_options.createMany({
      data: body.options.map((opt, index) => ({
        question_id: questionId,
        option_text: opt.option_text,
        option_label: String.fromCharCode(65 + index),
        is_correct: opt.is_correct,
        sort_order: index,
      })),
    });
  });

  return {
    success: true,
    message: 'MCQ question updated successfully',
  };
}
export async function getQuestionForEdit(
  prisma: PrismaClient,
  assessmentQuestionId: bigint,
  institutionId: number
) {
  const aq = await prisma.assessment_questions.findUnique({
    where: { id: assessmentQuestionId },
    include: {
      question: {
        include: { options: { orderBy: { sort_order: 'asc' } } },
      },
      assessment: true,
    },
  });

  if (!aq) throw new Error('Question not found');
  if (aq.assessment.institution_id !== institutionId) throw new Error('Forbidden');

  const q = aq.question;
  const isCoding = q.question_type === 'coding';
  const meta = q.metadata as any;

  if (isCoding) {
    return {
      assessment_question_id: aq.id.toString(),
      question_id: q.id.toString(),
      type: 'coding',
      topic: q.tags?.[0],
      difficulty_level: q.difficulty_level,
      points: aq.points,
      time_limit_minutes: meta.time_limit_minutes,
      problem_title: meta.problem_title,
      problem_statement: meta.problem_statement,
      constraints: meta.constraints,
      input_format: meta.input_format,
      output_format: meta.output_format,
      supported_languages: meta.supported_languages,
      sample_test_cases: meta.sample_test_cases,
    };
  }

  return {
    assessment_question_id: aq.id.toString(),
    question_id: q.id.toString(),
    type: 'mcq',
    topic: q.tags?.[0],
    question_text: q.question_text,
    difficulty_level: q.difficulty_level,
    points: aq.points,
    options: q.options.map((o) => ({
      id: o.id.toString(),
      option_text: o.option_text,
      is_correct: o.is_correct,
    })),
  };
}

export async function updateQuestion(
  prisma: PrismaClient,
  assessmentQuestionId: bigint,
  institutionId: number,
  userId: bigint,
  body: any
) {
  const aq = await prisma.assessment_questions.findUnique({
    where: { id: assessmentQuestionId },
    include: {
      assessment: true,
      question: true,
    },
  });

  if (!aq) throw new Error('Question not found');
  if (aq.assessment.institution_id !== institutionId) throw new Error('Forbidden');

  if (aq.assessment.status !== 'draft') {
    throw new Error('Cannot edit question in published assessment');
  }

  if (aq.question.question_type === 'coding') {
    return updateCodingQuestion(prisma, aq.question_id, body);
  }

  return updateMcqQuestionInternal(prisma, aq.question_id, body);
}

async function updateMcqQuestionInternal(
  prisma: PrismaClient,
  questionId: bigint,
  body: {
    topic?: string | string[];
    question_text: string;
    difficulty_level: QuestionDifficulty;
    points: number;
    options: { option_text: string; is_correct: boolean }[];
  }
) {
  const tags = normalizeTags(body.topic);
  if (body.options.length < 2) {
    throw new Error('At least 2 options required');
  }

  if (!body.options.some((o) => o.is_correct)) {
    throw new Error('At least one correct option required');
  }

  await prisma.$transaction(async (tx) => {
    await tx.question_bank.update({
      where: { id: questionId },
      data: {
        question_text: body.question_text,
        difficulty_level: body.difficulty_level,
        default_points: body.points,
        tags,
        updated_at: new Date(),
      },
    });

    await tx.question_options.deleteMany({
      where: { question_id: questionId },
    });

    await tx.question_options.createMany({
      data: body.options.map((opt, index) => ({
        question_id: questionId,
        option_text: opt.option_text,
        option_label: String.fromCharCode(65 + index),
        is_correct: opt.is_correct,
        sort_order: index,
      })),
    });
  });

  return { success: true, type: 'mcq' };
}
function normalizeTags(topic?: string | string[]) {
  if (!topic) return [];
  if (Array.isArray(topic)) {
    return topic.filter(Boolean);
  }
  return [topic];
}

async function updateCodingQuestion(
  prisma: PrismaClient,
  questionId: bigint,
  body: {
    topic?: string | string[];
    problem_title: string;
    problem_statement: string;
    constraints: string;
    input_format: string;
    output_format: string;
    sample_test_cases: { input: string; output: string }[];
    supported_languages: string[];
    difficulty_level: QuestionDifficulty;
    points: number;
    time_limit_minutes: number;
  }
) {
  const tags = normalizeTags(body.topic);
  await prisma.question_bank.update({
    where: { id: questionId },
    data: {
      question_text: body.problem_title,
      difficulty_level: body.difficulty_level,
      default_points: body.points,
      time_limit_seconds: body.time_limit_minutes * 60,
      tags,
      metadata: {
        problem_title: body.problem_title,
        problem_statement: body.problem_statement,
        constraints: body.constraints,
        input_format: body.input_format,
        output_format: body.output_format,
        supported_languages: body.supported_languages,
        sample_test_cases: body.sample_test_cases,
        time_limit_minutes: body.time_limit_minutes,
      },
      updated_at: new Date(),
    },
  });

  return { success: true, type: 'coding' };
}

// assessment.service.ts
export async function deleteAssessmentQuestion(
  prisma: PrismaClient,
  assessmentId: bigint,
  assessmentQuestionId: bigint,
  institutionId: number
) {
  const assessment = await prisma.assessments.findUnique({
    where: { id: assessmentId },
    select: {
      status: true,
      institution_id: true,
    },
  });

  if (!assessment) throw new Error('Assessment not found');
  if (assessment.institution_id !== institutionId) throw new Error('Forbidden');

  if (assessment.status !== 'draft') {
    throw new Error('Questions can be deleted only in draft assessments');
  }

  await prisma.assessment_questions.delete({
    where: { id: assessmentQuestionId },
  });
}

// assessment.service.ts
export async function updateAssessment(
  prisma: PrismaClient,
  assessmentId: bigint,
  institutionId: number,
  body: {
    title: string;
    description?: string;
    duration_minutes: number;
    instructions?: string;
    tags?: string[];
    category: string;
    assessment_type: string;
    question_type: string;
  }
) {
  const assessment = await prisma.assessments.findUnique({
    where: { id: assessmentId },
  });

  if (!assessment) throw new Error('Assessment not found');

  if (assessment.institution_id !== institutionId) {
    throw new Error('Forbidden');
  }

  if (assessment.status !== 'draft') {
    throw new Error('Only draft assessments can be edited');
  }

  await prisma.assessments.update({
    where: { id: assessmentId },
    data: {
      title: body.title,
      description: body.description,
      duration_minutes: body.duration_minutes,
      instructions: body.instructions,
      tags: body.tags ?? [],
      metadata: {
        category: body.category,
        assessment_type: body.assessment_type,
        question_type: body.question_type,
      },
      updated_at: new Date(),
    },
  });

  return {
    success: true,
    message: 'Assessment updated successfully',
  };
}


export async function bulkUploadCodingQuestions(
  prisma: PrismaClient,
  input: BulkUploadCodingInput
) {
  let rows: any[] = [];

  // ------------------------
  // Parse file
  // ------------------------
  if (input.fileName.endsWith('.xlsx')) {
    const workbook = XLSX.read(input.buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet);
  } else if (input.fileName.endsWith('.csv')) {
    rows = parse(input.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } else {
    throw new ConflictError('Only CSV or Excel files are supported');
  }

  if (!rows.length) {
    throw new ConflictError('Uploaded file is empty');
  }

  let created = 0;
  let attached = 0;
  let skipped = 0;

  // ------------------------
  // Process rows
  // ------------------------
  for (const row of rows) {
    const title = row['Problem Title'];
    const statement = row['Problem Statement'];
    const difficulty = row['Difficulty']?.toLowerCase();
    const points = Number(row['Points']) || 1;

    if (!title || !statement) {
      skipped++;
      continue;
    }

    const sample_test_cases = parseJsonSafe(row['Sample Test Cases']);
    const supported_languages = parseArraySafe(row['Supported Languages']);

    // 🔑 SINGLE SOURCE OF TRUTH
    const question = await findOrCreateQuestion(prisma, {
      institution_id: input.institution_id,
      created_by: input.created_by,
      question_text: title,
      question_type: 'coding',
      difficulty_level: difficulty ?? 'medium',
      points,
      tags: normalizeTags(row['Topic']),
      metadata: {
        problem_title: title,
        problem_statement: statement,
        constraints: row['Constraints'],
        input_format: row['Input Format'],
        output_format: row['Output Format'],
        sample_test_cases,
        supported_languages,
        time_limit_minutes: Number(row['Time Limit (min)']) || 1,
      },
    });

    // Detect reuse vs new
    if (question.created_at.getTime() !== question.updated_at.getTime()) {
      skipped++;
    } else {
      created++;
    }

    // 🔒 Attach safely
    await prisma.assessment_questions.upsert({
      where: {
        assessment_id_question_id: {
          assessment_id: input.assessment_id,
          question_id: question.id,
        },
      },
      update: {},
      create: {
        assessment_id: input.assessment_id,
        question_id: question.id,
        points,
        is_mandatory: true,
      },
    });

    attached++;
  }

  return {
    success: true,
    created_questions: created,
    attached_questions: attached,
    skipped_duplicates: skipped,
  };
}

function parseJsonSafe(value: any) {
  try {
    if (!value) return [];
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return [];
  }
}

function parseArraySafe(value: any) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}
