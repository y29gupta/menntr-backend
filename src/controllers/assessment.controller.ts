import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../services/assessment.service';
import { PrismaClient, QuestionDifficulty } from '@prisma/client';
import { ForbiddenError, ValidationError } from '../utils/errors';
import { CreateAssessmentSchema } from '../schemas/assessment.schema';

/* --------------------------------
   TYPES
--------------------------------- */

type IdParams = {
  id: string;
};

type TabQuery = {
  tab?: 'active' | 'draft' | 'closed';
};

function requirePermission(user: any, permission: string) {
  if (!user?.permissions?.includes(permission)) {
    throw new ForbiddenError('Insufficient permissions');
  }
}

interface UpdateMcqBody {
  topic: string;
  question_text: string;
  difficulty_level: 'easy' | 'medium' | 'hard';
  points: number;
  negative_points?: number;
  is_mandatory?: boolean;
  options: {
    id?: string; // optional (for UI tracking)
    option_text: string;
    is_correct: boolean;
  }[];
}

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

interface CreateMCQBody {
  topic: string; // UI selected topic
  question_text: string;
  question_type: 'single_correct' | 'multiple_correct' | 'true_false';
  difficulty_level: 'easy' | 'medium' | 'hard';
  points: number;
  negative_points?: number;
  is_mandatory?: boolean;
  options: {
    option_text: string;
    is_correct: boolean;
  }[];
}

interface CreateAssessmentBody {
  feature_id: number;
  title: string;
  description?: string;
  duration_minutes: number;
  tags?: string[];

  // UI meta
  category: 'Aptitude' | 'Domain';
  assessment_type: 'Practice' | 'Assignment' | 'Mock Test';
  question_type: 'MCQ' | 'Coding';
}

interface AssignAudienceBody {
  batch_ids: number[];
}

interface AddQuestionBody {
  question_id: bigint;
  points: number;
  negative_points?: number;
  is_mandatory?: boolean;
  sort_order?: number;
  section_name?: string;
}

interface BulkAddQuestionsBody {
  question_ids: bigint[];
}

interface ScheduleBody {
  start_time: string;
  end_time: string;
}
const QUESTION_TYPE_TO_PERMISSION = {
  mcq: 'mcq:create',
  coding: 'coding:create',
  manual: 'manual:create',
} as const;

const QUESTION_TYPE_TO_FEATURE_CODE = {
  mcq: 'assessment:mcq',
  coding: 'assessment:coding',
  manual: 'assessment:manual',
} as const;
/* --------------------------------
   META APIs
--------------------------------- */

// Screen 1 – Assessment Meta
export async function assessmentMetaHandler(_: FastifyRequest, reply: FastifyReply) {
  reply.send({
    assessmentCategories: ['Aptitude', 'Domain'],
    assessmentTypes: ['Practice', 'Assignment', 'Mock Test'],
    questionTypes: ['MCQ', 'Coding'],
  });
}

// Screen 3 – Question Meta
export async function questionMetaHandler(_: FastifyRequest, reply: FastifyReply) {
  reply.send({
    topics: ['Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability'],
    difficulties: ['easy', 'medium', 'hard'],
    questionTypes: ['single_correct', 'multiple_correct', 'true_false'],
  });
}

/* --------------------------------
   CORE FLOW
--------------------------------- */

// STEP 1 – Create Assessment
export async function createAssessmentHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  // 1️⃣ Validate body
  const parsed = CreateAssessmentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const { question_type } = parsed.data;

  // 2️⃣ Resolve permission
  const requiredPermission = QUESTION_TYPE_TO_PERMISSION[question_type];
  if (!requiredPermission) {
    throw new ValidationError('Unsupported question type');
  }

  // 3️⃣ Permission check
  requirePermission(user, requiredPermission);

  // 4️⃣ Resolve feature code
  const featureCode = QUESTION_TYPE_TO_FEATURE_CODE[question_type];
  if (!featureCode) {
    throw new ValidationError('Assessment feature not supported');
  }

  // 5️⃣ Fetch feature (single source of truth)
  const feature = await req.prisma.features.findUnique({
    where: { code: featureCode },
    select: { id: true },
  });

  if (!feature) {
    throw new ValidationError('Assessment feature not configured');
  }

  // 6️⃣ Create assessment
  const assessment = await service.createAssessment(req.prisma, {
    ...parsed.data,
    institution_id: user.institution_id,
    created_by: BigInt(user.sub),
    feature_id: feature.id,
  });

  reply.send(assessment);
}

// STEP 2 – Assign Audience
export async function assignAudienceHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: AssignAudienceBody }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  await service.assignAudience(
    req.prisma,
    BigInt(req.params.id),
    req.body.batch_ids,
    BigInt(user.sub)
  );

  reply.send({ success: true });
}

// STEP 3 – Add Question
export async function addQuestionHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: AddQuestionBody }>,
  reply: FastifyReply
) {
  const result = await service.addQuestion(req.prisma, BigInt(req.params.id), req.body);

  reply.send(result);
}

// STEP 3 – Bulk Upload
export async function bulkAddQuestionsHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: BulkAddQuestionsBody }>,
  reply: FastifyReply
) {
  const result = await service.bulkAddQuestions(
    req.prisma,
    BigInt(req.params.id),
    req.body.question_ids
  );

  reply.send(result);
}

// STEP 4 – Summary
export async function assessmentSummaryHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const summary = await service.getAssessmentSummary(req.prisma, BigInt(req.params.id));

  reply.send(summary);
}

// STEP 5 – Schedule
export async function scheduleAssessmentHandler(
  req: FastifyRequest<{
    Params: { id: string };
    Body: {
      publish_at: string;
      expiry_at?: string;
    };
  }>,
  reply: FastifyReply
) {
  await service.scheduleAssessment(req.prisma, BigInt(req.params.id), req.body);

  reply.send({ success: true });
}

// STEP 6 – Publish
export async function publishAssessmentHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const assessment = await service.publishAssessment(req.prisma, BigInt(req.params.id));

  reply.send(assessment);
}

// LIST & GET
export async function listAssessmentsHandler(
  req: FastifyRequest<{ Querystring: { tab?: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;
  const tab = req.query.tab;
  console.log("list assessment", user)
  if (tab !== 'active' && tab !== 'draft' && tab !== 'closed') {
    return reply.send({
      message: 'Invalid tab value',
    });
  }
  const list = await service.listAssessments(req.prisma, user.institution_id, tab);
  reply.send(list);
}

export async function getAssessmentHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const assessment = await service.getAssessment(req.prisma, BigInt(req.params.id));
  reply.send(assessment);
}

export async function createMCQQuestionHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: CreateMCQBody }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await service.createMCQQuestion(
    req.prisma,
    BigInt(req.params.id),
    user.institution_id,
    BigInt(user.sub),
    req.body
  );

  reply.send(result);
}

export async function assessmentAudienceMetaHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;
  console.log("assessment audience", user)
  const data = await service.getAssessmentAudienceMeta(req.prisma, user.institution_id);

  reply.send(data);
}

export async function listAssessmentQuestionsHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const data = await service.listAssessmentQuestions(req.prisma, BigInt(req.params.id));
  reply.send(data);
}

export async function getAssessmentAudienceHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const data = await service.getAssessmentAudience(req.prisma, BigInt(req.params.id));
  reply.send(data);
}

export async function updateAssessmentAccessHandler(
  req: FastifyRequest<{
    Params: { id: string };
    Body: {
      shuffle_questions: boolean;
      shuffle_options: boolean;
      allow_reattempts: boolean;
      show_correct_answers: boolean;
      show_score_immediate: boolean;
    };
  }>,
  reply: FastifyReply
) {
  await service.updateAssessmentAccess(req.prisma, BigInt(req.params.id), req.body);

  reply.send({ success: true });
}

export async function getAssessmentAccessHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const data = await service.getAssessmentAccess(req.prisma, BigInt(req.params.id));

  reply.send(data);
}

export async function deleteAssessmentHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;
  console.log("user data", user)
  await service.deleteAssessment(req.prisma, BigInt(req.params.id), user.institution_id);

  reply.send({ success: true });
}


export async function bulkUploadMcqHandler(req: FastifyRequest, reply: FastifyReply) {
  const file = await (req as any).file();

  if (!file) {
    return reply.status(400).send({
      message: 'CSV or Excel file is required',
    });
  }

  const user = req.user as any;

  const result = await service.bulkUploadMcqs(
    req.prisma, // ✅ SAME PATTERN AS YOUR OTHER SERVICES
    {
      fileName: file.filename,
      buffer: await file.toBuffer(),
      institution_id: user.institution_id,
      user_id: BigInt(user.sub),
    }
  );

  return reply.send(result);
}

export async function bulkCreateMcqForAssessmentHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;
  // const data = await req.file(); // from fastify-multipart
  const file = await (req as any).file();
  if (!file) {
    throw new Error('File is required');
  }

  // const buffer = await data.file.toBuffer();

  const result = await service.bulkCreateMcqForAssessment(req.prisma, {
    assessment_id: BigInt(req.params.id),
    institution_id: user.institution_id,
    created_by: BigInt(user.sub),
    fileName: file.filename,
    buffer: await file.toBuffer(),
  });

  reply.send(result);
}


export async function codingQuestionMetaHandler (
  _: FastifyRequest,
  reply: FastifyReply
){
  reply.send({
    topics: ['Arrays', 'Strings', 'Math', 'Dynamic Programming'],
    difficulties: ['easy', 'medium', 'hard'],
    timeLimits: [1, 3, 5, 10], // minutes
    languages: ['Java', 'Python', 'C++', 'JavaScript'],
  });
}

export async function createCodingQuestionHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: CreateCodingQuestionBody }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await service.createCodingQuestion(
    req.prisma,
    BigInt(req.params.id),
    user.institution_id,
    BigInt(user.sub),
    req.body
  );

  reply.send(result);
}

export async function getMcqQuestionHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const question = await service.getMcqQuestionForEdit(
    req.prisma,
    BigInt(req.params.id),
    user.institution_id
  );

  reply.send(question);
}
export async function updateMcqQuestionHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: UpdateMcqBody }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const updated = await service.updateMcqQuestion(
    req.prisma,
    BigInt(req.params.id),
    user.institution_id,
    BigInt(user.sub),
    req.body
  );

  reply.send(updated);
}

export async function getQuestionForEditHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getQuestionForEdit(
    req.prisma,
    BigInt(req.params.id),
    user.institution_id
  );

  reply.send(data);
}
export async function updateQuestionHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: any }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await service.updateQuestion(
    req.prisma,
    BigInt(req.params.id),
    user.institution_id,
    BigInt(user.sub),
    req.body
  );

  reply.send(result);
}
