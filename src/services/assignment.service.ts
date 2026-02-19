import { AssignmentStatus, PrismaClient, QuestionDifficulty, QuestionType } from '@prisma/client';
import { buildPaginatedResponse } from '../utils/pagination';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';

export async function listAssignments(
  prisma: PrismaClient,
  params: {
    institution_id: number;
    tab?: 'active' | 'draft' | 'closed';
    page?: number;
    limit?: number;
    search?: string;
  }
) {
  const page = params.page && params.page > 0 ? params.page : 1;
  const limit = params.limit && params.limit > 0 ? params.limit : 10;
  const skip = (page - 1) * limit;

  const now = new Date();

  const AND: any[] = [{ institution_id: params.institution_id }, { is_deleted: false }];

  /* ---------- TAB FILTER ---------- */

  if (params.tab === 'active') {
    AND.push({ status: 'published' });
    AND.push({
      OR: [{ due_date: null }, { due_date: { gt: now } }],
    });
  }

  if (params.tab === 'draft') {
    AND.push({ status: 'draft' });
  }

  if (params.tab === 'closed') {
    AND.push({
      OR: [{ status: 'closed' }, { due_date: { lt: now } }],
    });
  }

  /* ---------- SEARCH ---------- */

  if (params.search) {
    AND.push({
      OR: [
        { title: { contains: params.search, mode: 'insensitive' } },
        { description: { contains: params.search, mode: 'insensitive' } },
      ],
    });
  }

  const where = { AND };

  const [rows, total] = await Promise.all([
    prisma.assignments.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ updated_at: 'desc' }],
      include: {
        batches: {
          include: { batch: true },
        },
        _count: {
          select: { questions: true },
        },
      },
    }),
    prisma.assignments.count({ where }),
  ]);

  const formatted = rows.map((a) => ({
    id: a.id.toString(),
    title: a.title,
    category: a.category,
    type: a.assignment_type,
    questions: a._count.questions,
    batches: a.batches.map((b) => b.batch.name).join(', '),
    dueDate: a.expiry_at,
    status: a.status,
    lastEdited: a.updated_at,
  }));

  return buildPaginatedResponse(formatted, total, page, limit);
}


export async function createAssignment(
  prisma: PrismaClient,
  data: {
    institution_id: number;
    created_by: bigint;
    title: string;
    description?: string;
    category: 'APTITUDE' | 'DOMAIN';
    assignment_type: 'PRACTICE' | 'GRADED';
    question_type: 'MCQ' | 'CODING' | 'THEORY';
  }
) {
  return prisma.assignments.create({
    data: {
      institution_id: data.institution_id,
      created_by: data.created_by,
      title: data.title,
      description: data.description,
      category: data.category,
      assignment_type: data.assignment_type,
      question_type: data.question_type,
      status: AssignmentStatus.draft,
    },
  });
}


export async function getAssignmentAudienceMeta(prisma: PrismaClient, institutionId: number) {
  const batches = await prisma.batches.findMany({
    where: {
      institution_id: institutionId,
      is_active: true,
    },
    include: {
      category_role: true,
      department_role: true,
    },
    orderBy: { name: 'asc' },
  });

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

    department.batches.push({
      id: batch.id,
      name: batch.name,
      academicYear: batch.academic_year,
      semester: batch.semester,
    });
  }

  return Array.from(categoryMap.values()).map((cat) => ({
    id: cat.id,
    name: cat.name,
    departments: Array.from(cat.departments.values()),
  }));
}

export async function assignAssignmentToBatches(
  prisma: PrismaClient,
  assignmentId: bigint,
  batchIds: number[]
) {
  for (const batchId of batchIds) {
    await prisma.assignment_batches.upsert({
      where: {
        assignment_id_batch_id: {
          assignment_id: assignmentId,
          batch_id: batchId,
        },
      },
      update: {},
      create: {
        assignment_id: assignmentId,
        batch_id: batchId,
      },
    });
  }

  return { success: true };
}


export async function createAssignmentMcqQuestion(
  prisma: PrismaClient,
  input: {
    assignment_id: bigint;
    institution_id: number;
    created_by: bigint;
    body: {
      topic: string;
      question_text: string;
      question_type: QuestionType;
      difficulty_level: QuestionDifficulty;
      points: number;
      is_mandatory?: boolean;
      options: {
        option_text: string;
        is_correct: boolean;
      }[];
    };
  }
) {
  if (input.body.options.length < 2) {
    throw new Error('Minimum 2 options required');
  }

  if (!input.body.options.some((o) => o.is_correct)) {
    throw new Error('At least one correct option required');
  }

  // 1️⃣ Create Question
  const question = await prisma.question_bank.create({
    data: {
      institution_id: input.institution_id,
      created_by: input.created_by,
      question_text: input.body.question_text,
      question_type: input.body.question_type,
      difficulty_level: input.body.difficulty_level,
      default_points: input.body.points,
      tags: [input.body.topic],
    },
  });

  // 2️⃣ Insert Options
  await prisma.question_options.createMany({
    data: input.body.options.map((opt, index) => ({
      question_id: question.id,
      option_text: opt.option_text,
      option_label: String.fromCharCode(65 + index),
      is_correct: opt.is_correct,
      sort_order: index,
    })),
  });

  // 3️⃣ Attach to Assignment
  await prisma.assignment_questions.create({
    data: {
      assignment_id: input.assignment_id,
      question_id: question.id,
      points: input.body.points,
    },
  });

  return {
    success: true,
    question_id: question.id.toString(),
  };
}


export async function bulkUploadAssignmentMcqs(
  prisma: PrismaClient,
  input: {
    assignment_id: bigint;
    institution_id: number;
    created_by: bigint;
    fileName: string;
    buffer: Buffer;
  }
) {
  let rows: any[] = [];

  // ---------------- Parse File ----------------
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
    medium: 'medium',
    hard: 'hard',
  };

  let created = 0;
  let attached = 0;
  let skipped = 0;

  for (const row of rows) {
    const questionText = row['Question'];
    const topic = row['Topic'];
    const difficulty = difficultyMap[row['Difficulty']?.toLowerCase()] ?? 'medium';
    const points = Number(row['Points']) || 1;
    const correctAnswer = row['Correct Answer'];

    const answers = [row['Answer 1'], row['Answer 2'], row['Answer 3'], row['Answer 4']].filter(
      Boolean
    );

    if (!questionText || !correctAnswer || answers.length < 2) {
      skipped++;
      continue;
    }

    // 1️⃣ Create Question
    const question = await prisma.question_bank.create({
      data: {
        institution_id: input.institution_id,
        created_by: input.created_by,
        question_text: questionText,
        question_type: QuestionType.single_correct,
        difficulty_level: difficulty,
        default_points: points,
        tags: topic ? [topic] : [],
      },
    });

    created++;

    // 2️⃣ Create Options
    await prisma.question_options.createMany({
      data: answers.map((ans: string, index: number) => ({
        question_id: question.id,
        option_text: ans,
        option_label: String.fromCharCode(65 + index),
        is_correct: ans === correctAnswer,
        sort_order: index,
      })),
    });

    // 3️⃣ Attach to Assignment (Prevent Duplicate)
    await prisma.assignment_questions.upsert({
      where: {
        assignment_id_question_id: {
          assignment_id: input.assignment_id,
          question_id: question.id,
        },
      },
      update: {},
      create: {
        assignment_id: input.assignment_id,
        question_id: question.id,
        points,
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


export async function listAssignmentQuestions(prisma: PrismaClient, assignmentId: bigint) {
  const rows = await prisma.assignment_questions.findMany({
    where: { assignment_id: assignmentId },
    orderBy: { id: 'asc' },
    include: {
      question: {
        include: {
          options: true,
        },
      },
    },
  });

  return rows.map((row, index) => ({
    assignment_question_id: row.id.toString(),
    question_id: row.question_id.toString(),
    questionNo: index + 1,
    questionText: row.question.question_text,
    marks: row.points,
    topic: row.question.tags?.[0] ?? 'General',
    difficulty: row.question.difficulty_level,
    questionType: row.question.question_type,
    isMandatory: true, // optional if you add column later
  }));
}

export async function deleteAssignmentQuestion(
  prisma: PrismaClient,
  assignmentId: bigint,
  assignmentQuestionId: bigint,
  institutionId: number
) {
  const assignment = await prisma.assignments.findUnique({
    where: { id: assignmentId },
    select: {
      institution_id: true,
      status: true,
    },
  });

  if (!assignment) throw new Error('Assignment not found');
  if (assignment.institution_id !== institutionId) throw new Error('Forbidden');

  if (assignment.status !== 'draft') {
    throw new Error('Cannot delete question from published assignment');
  }

  await prisma.assignment_questions.delete({
    where: { id: assignmentQuestionId },
  });

  return { success: true };
}


export async function publishAssignmentFinal(
  prisma: PrismaClient,
  input: {
    assignment_id: bigint;
    institution_id: number;
    publish_at?: Date;
    expiry_at?: Date;
    shuffle_questions: boolean;
    shuffle_options: boolean;
    allow_reattempts: boolean;
    show_correct_answers: boolean;
    show_score_immediately: boolean;
  }
) {
  const assignment = await prisma.assignments.findUnique({
    where: { id: input.assignment_id },
    include: {
      questions: true,
      batches: true,
    },
  });

  if (!assignment) throw new Error('Assignment not found');
  if (assignment.institution_id !== input.institution_id) throw new Error('Forbidden');

  if (assignment.status !== 'draft') throw new Error('Assignment already published');

  if (assignment.questions.length === 0) throw new Error('Add at least one question');

  if (assignment.batches.length === 0) throw new Error('Assign at least one batch');

  // Calculate total marks
  const totalMarks = assignment.questions.reduce((sum, q) => sum + q.points, 0);

  return prisma.assignments.update({
    where: { id: input.assignment_id },
    data: {
      total_marks: totalMarks,
      publish_at: input.publish_at,
      expiry_at: input.expiry_at,

      shuffle_questions: input.shuffle_questions,
      shuffle_options: input.shuffle_options,
      allow_reattempts: input.allow_reattempts,
      show_correct_answers: input.show_correct_answers,
      show_score_immediately: input.show_score_immediately,

      status: AssignmentStatus.published,
      published_at: new Date(),
    },
  });
}
