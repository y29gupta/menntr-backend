import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../services/assessment.service';
import { PrismaClient, QuestionDifficulty } from '@prisma/client';

/* --------------------------------
   TYPES
--------------------------------- */
interface CreateMCQBody {
  question_text: string;
  difficulty_level: 'easy' | 'medium' | 'hard' | 'expert';
  question_type: 'single_correct' | 'multiple_correct';
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
export async function createAssessmentHandler(
  req: FastifyRequest<{ Body: CreateAssessmentBody }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const assessment = await service.createAssessment(req.prisma, {
    institution_id: user.institution_id,
    created_by: BigInt(user.sub),
    feature_id: req.body.feature_id,
    title: req.body.title,
    description: req.body.description,
    duration_minutes: req.body.duration_minutes,
    tags: req.body.tags,
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
  const result = await service.addQuestion(
    req.prisma,
    BigInt(req.params.id),
    req.body
  );

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
  const summary = await service.getAssessmentSummary(
    req.prisma,
    BigInt(req.params.id)
  );

  reply.send(summary);
}

// STEP 5 – Schedule
export async function scheduleAssessmentHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: ScheduleBody }>,
  reply: FastifyReply
) {
  await service.scheduleAssessment(
    req.prisma,
    BigInt(req.params.id),
    req.body
  );

  reply.send({ success: true });
}

// STEP 6 – Publish
export async function publishAssessmentHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const assessment = await service.publishAssessment(
    req.prisma,
    BigInt(req.params.id)
  );

  reply.send(assessment);
}

// LIST & GET
export async function listAssessmentsHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;
  const list = await service.listAssessments(req.prisma, user.institution_id);
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
