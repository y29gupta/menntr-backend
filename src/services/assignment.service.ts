import { AssignmentStatus, Prisma, PrismaClient, QuestionDifficulty, QuestionType } from '@prisma/client';
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

// export async function deleteAssignmentQuestion(
//   prisma: PrismaClient,
//   assignmentId: bigint,
//   assignmentQuestionId: bigint,
//   institutionId: number
// ) {
//   const assignment = await prisma.assignments.findUnique({
//     where: { id: assignmentId },
//     select: {
//       institution_id: true,
//       status: true,
//     },
//   });

//   if (!assignment) throw new Error('Assignment not found');
//   if (assignment.institution_id !== institutionId) throw new Error('Forbidden');

//   if (assignment.status !== 'draft') {
//     throw new Error('Cannot delete question from published assignment');
//   }

//   await prisma.assignment_questions.delete({
//     where: { id: assignmentQuestionId },
//   });

//   return { success: true };
// }


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


export async function createAssignmentCodingQuestion(prisma: PrismaClient, input: any) {
  if (!input.body.sample_test_cases?.length) {
    throw new Error('At least one sample test case required');
  }

  // 1️⃣ Find existing
  let question = await prisma.question_bank.findUnique({
    where: {
      uq_question_per_institution: {
        institution_id: input.institution_id,
        question_text: input.body.title,
        question_type: 'coding',
      },
    },
  });

  // 2️⃣ Create if not exists
if (!question) {
  question = await prisma.question_bank.create({
    data: {
      institution_id: input.institution_id,
      created_by: input.created_by,
      question_text: input.body.title,
      question_type: 'coding',
      difficulty_level: input.body.difficulty_level,
      default_points: input.body.points,
      time_limit_seconds: input.body.time_limit_seconds ?? 2,
      explanation: input.body.problem_statement,
      metadata: {
        constraints: input.body.constraints,
        input_format: input.body.input_format,
        output_format: input.body.output_format,
        sample_test_cases: input.body.sample_test_cases,
        languages: input.body.languages,
      },
      tags: ['coding'],
    },
  });
} else {
  // 🔥 UPDATE existing metadata
  question = await prisma.question_bank.update({
    where: { id: question.id },
    data: {
      difficulty_level: input.body.difficulty_level,
      default_points: input.body.points,
      time_limit_seconds: input.body.time_limit_seconds ?? 2,
      explanation: input.body.problem_statement,
      metadata: {
        constraints: input.body.constraints,
        input_format: input.body.input_format,
        output_format: input.body.output_format,
        sample_test_cases: input.body.sample_test_cases,
        languages: input.body.languages,
      },
    },
  });
}


  // 3️⃣ Attach safely
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
      points: input.body.points,
    },
  });

  return {
    success: true,
    question_id: question.id.toString(),
  };
}



export async function getAssignmentQuestions(
  prisma: PrismaClient,
  assignmentId: bigint,
  institutionId: number
) {
  const assignment = await prisma.assignments.findFirst({
    where: {
      id: assignmentId,
      institution_id: institutionId,
      is_deleted: false,
    },
  });

  if (!assignment) {
    throw new Error('Assignment not found');
  }

  const rows = await prisma.assignment_questions.findMany({
    where: { assignment_id: assignmentId },
    orderBy: { id: 'asc' },
    include: {
      question: {
        include: {
          options: {
            orderBy: { sort_order: 'asc' },
          },
        },
      },
    },
  });

  return rows.map((row, index) => {
    const q = row.question;

    const base = {
      assignment_question_id: row.id.toString(),
      question_id: q.id.toString(),
      questionNo: index + 1,
      questionType: q.question_type,
      difficulty: q.difficulty_level,
      marks: row.points,
      topic: q.tags?.[0] ?? null,
      isMandatory: true,
    };

    // ---------------- MCQ ----------------
    if (
      q.question_type === 'single_correct' ||
      q.question_type === 'multiple_correct' ||
      q.question_type === 'true_false'
    ) {
      return {
        ...base,
        question_text: q.question_text,
        options: q.options.map((opt) => ({
          id: opt.id.toString(),
          option_text: opt.option_text,
          option_label: opt.option_label,
          is_correct: opt.is_correct,
        })),
        negative_points: q.negative_points,
      };
    }

    // ---------------- CODING ----------------
    if (q.question_type === 'coding') {
      const meta = q.metadata as any;

      return {
        ...base,
        title: q.question_text,
        problem_statement: q.explanation,
        constraints: meta?.constraints ?? null,
        time_limit_seconds: q.time_limit_seconds,
        input_format: meta?.input_format ?? null,
        output_format: meta?.output_format ?? null,
        sample_test_cases: meta?.sample_test_cases ?? [],
        languages: meta?.languages ?? [],
      };
    }
    if (q.question_type === 'theory') {
      const meta = q.metadata as any;

      return {
        ...base,
        question_text: q.question_text,
        answer_guidelines: meta?.answer_guidelines ?? null,
        allow_file_upload: meta?.allow_file_upload ?? false,
        allowed_file_types: meta?.allowed_file_types ?? [],
      };
    }


    return base;
  });
}


export async function bulkUploadAssignmentCoding(
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

  // -------- Parse File --------
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
    throw new Error('Only CSV or Excel supported');
  }

  if (!rows.length) {
    throw new Error('File is empty');
  }

  const difficultyMap: Record<string, QuestionDifficulty> = {
    easy: 'easy',
    medium: 'medium',
    hard: 'hard',
    expert: 'expert',
  };

  let created = 0;
  let updated = 0;
  let attached = 0;
  let skipped = 0;

  for (const row of rows) {
    const title = row['Title'];
    if (!title) {
      skipped++;
      continue;
    }

    const difficulty = difficultyMap[row['Difficulty']?.toLowerCase()] ?? 'medium';

    const points = Number(row['Points']) || 1;
    const timeLimit = Number(row['Time Limit']) || 2;

    const languages = row['Languages']
      ? row['Languages'].split(',').map((l: string) => l.trim())
      : [];

    const sampleInput = row['Sample Input'];
    const sampleOutput = row['Sample Output'];

    const metadata = {
      constraints: row['Constraints'] ?? null,
      input_format: row['Input Format'] ?? null,
      output_format: row['Output Format'] ?? null,
      sample_test_cases:
        sampleInput && sampleOutput ? [{ input: sampleInput, output: sampleOutput }] : [],
      languages,
    };

    // 1️⃣ Check existing
    let question = await prisma.question_bank.findUnique({
      where: {
        uq_question_per_institution: {
          institution_id: input.institution_id,
          question_text: title,
          question_type: QuestionType.coding,
        },
      },
    });

    // 2️⃣ Create or Update
    if (!question) {
      question = await prisma.question_bank.create({
        data: {
          institution_id: input.institution_id,
          created_by: input.created_by,
          question_text: title,
          question_type: QuestionType.coding,
          difficulty_level: difficulty,
          default_points: points,
          time_limit_seconds: timeLimit,
          explanation: row['Problem Statement'] ?? null,
          metadata,
          tags: ['coding'],
        },
      });

      created++;
    } else {
      question = await prisma.question_bank.update({
        where: { id: question.id },
        data: {
          difficulty_level: difficulty,
          default_points: points,
          time_limit_seconds: timeLimit,
          explanation: row['Problem Statement'] ?? null,
          metadata,
        },
      });

      updated++;
    }

    // 3️⃣ Attach to assignment
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
    created,
    updated,
    attached,
    skipped,
  };
}

export async function getAssignmentPublishSummary(
  prisma: PrismaClient,
  assignmentId: bigint,
  institutionId: number
) {
  const assignment = await prisma.assignments.findFirst({
    where: {
      id: assignmentId,
      institution_id: institutionId,
      is_deleted: false,
    },
    include: {
      questions: {
        include: {
          question: true,
        },
      },
    },
  });

  if (!assignment) {
    throw new Error('Assignment not found');
  }

  const questions = assignment.questions;

  if (!questions.length) {
    throw new Error('No questions added');
  }

  // ---------------- BASIC COUNTS ----------------

  const totalQuestions = questions.length;
  const totalMarks = questions.reduce((sum, q) => sum + q.points, 0);

  // ---------------- DIFFICULTY MIX ----------------

  const difficultyCount: Record<string, number> = {
    easy: 0,
    medium: 0,
    hard: 0,
    expert: 0,
  };

  for (const q of questions) {
    difficultyCount[q.question.difficulty_level]++;
  }

  // Format: Easy (10) • Medium (12) • Hard (8)
  const difficultyMix = Object.entries(difficultyCount)
    .filter(([_, v]) => v > 0)
    .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} (${v})`)
    .join(' • ');

  // ---------------- QUESTION TYPE MIX ----------------

  const mcqQuestions = questions.filter((q) =>
    ['single_correct', 'multiple_correct', 'true_false'].includes(q.question.question_type)
  );

  const codingQuestions = questions.filter((q) => q.question.question_type === 'coding');

  const theoryQuestions = questions.filter((q) => q.question.question_type === 'theory');

  // ---------------- CODING AGGREGATIONS ----------------

  const languagesSet = new Set<string>();
  let testCasesConfigured = true;

  for (const q of codingQuestions) {
    const meta = q.question.metadata as any;

    if (meta?.languages) {
      meta.languages.forEach((l: string) => languagesSet.add(l));
    }

    if (!meta?.sample_test_cases?.length) {
      testCasesConfigured = false;
    }
  }

  const supportedLanguages = Array.from(languagesSet);
  // ---------------- THEORY AGGREGATIONS ----------------

  let fileUploadEnabledCount = 0;
  const allowedFileTypesSet = new Set<string>();

  for (const q of theoryQuestions) {
    const meta = q.question.metadata as any;

    if (meta?.allow_file_upload) {
      fileUploadEnabledCount++;
    }

    if (meta?.allowed_file_types?.length) {
      meta.allowed_file_types.forEach((type: string) => allowedFileTypesSet.add(type));
    }
  }

  const allowedFileTypes = Array.from(allowedFileTypesSet);

  // ---------------- RESPONSE STRUCTURE ----------------

return {
  id: assignment.id.toString(),
  title: assignment.title,
  category: assignment.category,
  assignment_type: assignment.assignment_type,
  question_type: assignment.question_type,

  total_questions: totalQuestions,
  total_marks: totalMarks,
  difficulty_mix: difficultyMix,
  mandatory: true,

  mcq_count: mcqQuestions.length,
  coding_count: codingQuestions.length,
  theory_count: theoryQuestions.length,

  supported_languages: supportedLanguages,
  test_case_status:
    codingQuestions.length > 0
      ? testCasesConfigured
        ? 'Sample Test Cases Configured'
        : 'Missing Sample Test Cases'
      : null,

  theory_file_upload_enabled_count: fileUploadEnabledCount,
  allowed_file_types: allowedFileTypes,
};

}

export async function getAssignmentAudienceSummary(
  prisma: PrismaClient,
  assignmentId: bigint,
  institutionId: number
) {
  const assignment = await prisma.assignments.findFirst({
    where: {
      id: assignmentId,
      institution_id: institutionId,
      is_deleted: false,
    },
    include: {
      batches: {
        include: {
          batch: {
            include: {
              category_role: true,
              department_role: true,
            },
          },
        },
      },
    },
  });

  if (!assignment) {
    throw new Error('Assignment not found');
  }

  if (!assignment.batches.length) {
    throw new Error('No batches assigned');
  }

  const categoryMap = new Map<
    number,
    {
      category_name: string;
      departments: Map<
        number,
        {
          department_name: string;
          batches: string[];
        }
      >;
    }
  >();

  for (const item of assignment.batches) {
    const batch = item.batch;

    if (!batch.category_role || !batch.department_role) continue;

    // CATEGORY
    if (!categoryMap.has(batch.category_role.id)) {
      categoryMap.set(batch.category_role.id, {
        category_name: batch.category_role.name,
        departments: new Map(),
      });
    }

    const category = categoryMap.get(batch.category_role.id)!;

    // DEPARTMENT
    if (!category.departments.has(batch.department_role.id)) {
      category.departments.set(batch.department_role.id, {
        department_name: batch.department_role.name,
        batches: [],
      });
    }

    const department = category.departments.get(batch.department_role.id)!;

    department.batches.push(batch.name);
  }

  // Format UI response
  const formatted = Array.from(categoryMap.values()).map((cat) => ({
    institution_category: cat.category_name,
    departments: Array.from(cat.departments.values()).map((dep) => ({
      department_name: dep.department_name,
      batches: dep.batches,
    })),
  }));

  return {
    assignment_id: assignment.id.toString(),
    title: assignment.title,
    assigned_to: formatted,
  };
}

export async function editAssignmentQuestion(
  prisma: PrismaClient,
  input: {
    assignment_id: bigint;
    assignment_question_id: bigint;
    institution_id: number;
    body: any;
  }
) {
  // 1️⃣ Validate assignment
  const assignment = await prisma.assignments.findUnique({
    where: { id: input.assignment_id },
    select: { institution_id: true, status: true },
  });

  if (!assignment) throw new Error('Assignment not found');
  if (assignment.institution_id !== input.institution_id) throw new Error('Forbidden');

  if (assignment.status !== 'draft') {
    throw new Error('Cannot edit question after publish');
  }

  // 2️⃣ Get assignment_question
  const assignmentQuestion = await prisma.assignment_questions.findUnique({
    where: { id: input.assignment_question_id },
    include: { question: true },
  });

  if (!assignmentQuestion) throw new Error('Question not found');

  const originalQuestion = assignmentQuestion.question;

  // 3️⃣ Check usage count
  const usageCount = await prisma.assignment_questions.count({
    where: { question_id: originalQuestion.id },
  });

  let questionToUpdate = originalQuestion;

  // 4️⃣ Clone if used in multiple assignments
  if (usageCount > 1) {
    const cloned = await prisma.question_bank.create({
      data: {
        institution_id: originalQuestion.institution_id,
        created_by: originalQuestion.created_by,
        question_text: originalQuestion.question_text,
        question_type: originalQuestion.question_type,
        difficulty_level: originalQuestion.difficulty_level,
        default_points: originalQuestion.default_points,
        negative_points: originalQuestion.negative_points,
        time_limit_seconds: originalQuestion.time_limit_seconds,
        explanation: originalQuestion.explanation,
        metadata:
          originalQuestion.metadata === null
            ? undefined
            : (originalQuestion.metadata as Prisma.InputJsonValue),
        tags: originalQuestion.tags,
      },
    });


    // Relink assignment to cloned question
    await prisma.assignment_questions.update({
      where: { id: input.assignment_question_id },
      data: { question_id: cloned.id },
    });

    questionToUpdate = cloned;
  }

  // 5️⃣ Update based on type
  if (
    questionToUpdate.question_type === 'single_correct' ||
    questionToUpdate.question_type === 'multiple_correct' ||
    questionToUpdate.question_type === 'true_false'
  ) {
    await updateMcqQuestion(prisma, questionToUpdate.id, input.body);
  }
  if (questionToUpdate.question_type === 'theory') {
    await updateTheoryQuestion(prisma, questionToUpdate.id, input.body);
  }

  if (questionToUpdate.question_type === 'coding') {
    await updateCodingQuestion(prisma, questionToUpdate.id, input.body);
  }

  return { success: true };
}

async function updateMcqQuestion(prisma: PrismaClient, questionId: bigint, body: any) {
  if (!body.options?.length) {
    throw new Error('Options required');
  }

  await prisma.question_bank.update({
    where: { id: questionId },
    data: {
      question_text: body.question_text,
      difficulty_level: body.difficulty_level,
      default_points: body.points,
      tags: body.topic ? [body.topic] : [],
    },
  });

  // Delete old options
  await prisma.question_options.deleteMany({
    where: { question_id: questionId },
  });

  // Reinsert new options
  await prisma.question_options.createMany({
    data: body.options.map((opt: any, index: number) => ({
      question_id: questionId,
      option_text: opt.option_text,
      option_label: String.fromCharCode(65 + index),
      is_correct: opt.is_correct,
      sort_order: index,
    })),
  });
}

async function updateCodingQuestion(prisma: PrismaClient, questionId: bigint, body: any) {
  await prisma.question_bank.update({
    where: { id: questionId },
    data: {
      question_text: body.title,
      difficulty_level: body.difficulty_level,
      default_points: body.points,
      time_limit_seconds: body.time_limit_seconds,
      explanation: body.problem_statement,
      metadata: {
        constraints: body.constraints,
        input_format: body.input_format,
        output_format: body.output_format,
        sample_test_cases: body.sample_test_cases,
        languages: body.languages,
      },
    },
  });
}

export async function deleteAssignmentQuestion(
  prisma: PrismaClient,
  input: {
    assignment_id: bigint;
    assignment_question_id: bigint;
    institution_id: number;
  }
) {
  // 1️⃣ Validate assignment
  const assignment = await prisma.assignments.findUnique({
    where: { id: input.assignment_id },
    select: {
      institution_id: true,
      status: true,
    },
  });

  if (!assignment) {
    throw new Error('Assignment not found');
  }

  if (assignment.institution_id !== input.institution_id) {
    throw new Error('Forbidden');
  }

  if (assignment.status !== 'draft') {
    throw new Error('Cannot delete question after publish');
  }

  // 2️⃣ Validate mapping exists
  const mapping = await prisma.assignment_questions.findFirst({
    where: {
      id: input.assignment_question_id,
      assignment_id: input.assignment_id,
    },
  });

  if (!mapping) {
    throw new Error('Question not linked to this assignment');
  }

  // 3️⃣ Remove from assignment only
  await prisma.assignment_questions.delete({
    where: { id: input.assignment_question_id },
  });

  return { success: true };
}


export async function createAssignmentTheoryQuestion(
  prisma: PrismaClient,
  input: {
    assignment_id: bigint;
    institution_id: number;
    created_by: bigint;
    body: any;
  }
) {
  // 1️⃣ Create question
  const question = await prisma.question_bank.create({
    data: {
      institution_id: input.institution_id,
      created_by: input.created_by,
      question_text: input.body.question_text,
      question_type: 'theory',
      difficulty_level: input.body.difficulty_level,
      default_points: input.body.points,
      tags: input.body.topic ? [input.body.topic] : [],
      metadata: {
        answer_guidelines: input.body.answer_guidelines ?? null,
        allow_file_upload: input.body.allow_file_upload ?? false,
        allowed_file_types: input.body.allowed_file_types ?? [],
      },
    },
  });

  // 2️⃣ Attach to assignment
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

async function updateTheoryQuestion(prisma: PrismaClient, questionId: bigint, body: any) {
  await prisma.question_bank.update({
    where: { id: questionId },
    data: {
      question_text: body.question_text,
      difficulty_level: body.difficulty_level,
      tags: body.topic ? [body.topic] : [],
      metadata: {
        answer_guidelines: body.answer_guidelines ?? null,
        allow_file_upload: body.allow_file_upload ?? false,
        allowed_file_types: body.allowed_file_types ?? [],
      },
    },
  });
}
