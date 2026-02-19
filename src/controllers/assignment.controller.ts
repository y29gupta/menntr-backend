import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../services/assignment.service';
import { z } from 'zod';

export async function listAssignmentsHandler(
  req: FastifyRequest<{
    Querystring: {
      tab?: 'active' | 'draft' | 'closed';
      page?: string;
      limit?: string;
      search?: string;
    };
  }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const result = await service.listAssignments(req.prisma, {
    institution_id: user.institution_id,
    tab: req.query.tab,
    page: Number(req.query.page),
    limit: Number(req.query.limit),
    search: req.query.search,
  });

  reply.send(result);
}

export async function assignmentMetaHandler(_: FastifyRequest, reply: FastifyReply) {
  reply.send({
    categories: [
      { label: 'Aptitude', value: 'APTITUDE' },
      { label: 'Domain', value: 'DOMAIN' },
    ],
    assignmentTypes: [
      { label: 'Practice', value: 'PRACTICE' },
      { label: 'Graded Assignment', value: 'GRADED' },
    ],
    questionTypes: [
      { label: 'MCQ', value: 'MCQ' },
      { label: 'Coding', value: 'CODING' },
      { label: 'Theory', value: 'THEORY' },
    ],
  });
}


const CreateAssignmentSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  category: z.enum(['APTITUDE', 'DOMAIN']),
  assignment_type: z.enum(['PRACTICE', 'GRADED']),
  question_type: z.enum(['MCQ', 'CODING', 'THEORY']),
});

export async function createAssignmentHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const parsed = CreateAssignmentSchema.safeParse(req.body);

  if (!parsed.success) {
    return reply.status(400).send({
      message: 'Invalid request',
      errors: parsed.error.issues,
    });
  }

  const assignment = await service.createAssignment(req.prisma, {
    institution_id: user.institution_id,
    created_by: BigInt(user.sub),
    ...parsed.data,
  });

  reply.send(assignment);
}

export async function assignmentAudienceMetaHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const data = await service.getAssignmentAudienceMeta(req.prisma, user.institution_id);

  reply.send({ categories: data });
}


const AssignAudienceSchema = z.object({
  batch_ids: z.array(z.number()).min(1),
});

export async function assignAssignmentAudienceHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const parsed = AssignAudienceSchema.safeParse(req.body);

  if (!parsed.success) {
    return reply.status(400).send({
      message: 'Invalid request',
      errors: parsed.error.issues,
    });
  }

  await service.assignAssignmentToBatches(req.prisma, BigInt(req.params.id), parsed.data.batch_ids);

  reply.send({ success: true });
}

export async function assignmentQuestionMetaHandler(_: FastifyRequest, reply: FastifyReply) {
  reply.send({
    topics: ['Data Structures', 'Algorithms', 'Operating Systems', 'Database', 'OOPS'],
    questionTypes: [
      { label: 'Single Correct', value: 'single_correct' },
      { label: 'Multiple Correct', value: 'multiple_correct' },
      { label: 'True / False', value: 'true_false' },
    ],
    difficulties: [
      { label: 'Easy', value: 'easy' },
      { label: 'Medium', value: 'medium' },
      { label: 'Hard', value: 'hard' },
    ],
  });
}


const CreateMcqSchema = z.object({
  topic: z.string(),
  question_text: z.string().min(5),
  question_type: z.enum(['single_correct', 'multiple_correct', 'true_false']),
  difficulty_level: z.enum(['easy', 'medium', 'hard']),
  points: z.number().min(1),
  is_mandatory: z.boolean().optional(),
  options: z
    .array(
      z.object({
        option_text: z.string(),
        is_correct: z.boolean(),
      })
    )
    .min(2),
});

export async function createAssignmentMcqQuestionHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const parsed = CreateMcqSchema.safeParse(req.body);

  if (!parsed.success) {
    return reply.status(400).send({
      message: 'Invalid request',
      errors: parsed.error.issues,
    });
  }

  const result = await service.createAssignmentMcqQuestion(req.prisma, {
    assignment_id: BigInt(req.params.id),
    institution_id: user.institution_id,
    created_by: BigInt(user.sub),
    body: parsed.data,
  });

  reply.send(result);
}

export async function bulkUploadAssignmentMcqHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const file = await (req as any).file();
  if (!file) {
    return reply.status(400).send({
      message: 'CSV or Excel file is required',
    });
  }

  const result = await service.bulkUploadAssignmentMcqs(req.prisma, {
    assignment_id: BigInt(req.params.id),
    institution_id: user.institution_id,
    created_by: BigInt(user.sub),
    fileName: file.filename,
    buffer: await file.toBuffer(),
  });

  reply.send(result);
}

export async function listAssignmentQuestionsHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const data = await service.listAssignmentQuestions(req.prisma, BigInt(req.params.id));

  reply.send(data);
}

export async function deleteAssignmentQuestionHandler(
  req: FastifyRequest<{
    Params: { assignmentId: string; assignmentQuestionId: string };
  }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  await service.deleteAssignmentQuestion(
    req.prisma,
    BigInt(req.params.assignmentId),
    BigInt(req.params.assignmentQuestionId),
    user.institution_id
  );

  reply.send({ success: true });
}


const PublishSchema = z.object({
  publish_at: z.string().datetime().optional(),
  expiry_at: z.string().datetime().optional(),

  shuffle_questions: z.boolean(),
  shuffle_options: z.boolean(),
  allow_reattempts: z.boolean(),
  show_correct_answers: z.boolean(),
  show_score_immediately: z.boolean(),
});

export async function publishAssignmentFinalHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const parsed = PublishSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send(parsed.error);
  }

  const result = await service.publishAssignmentFinal(req.prisma, {
    assignment_id: BigInt(req.params.id),
    institution_id: user.institution_id,
    publish_at: parsed.data.publish_at ? new Date(parsed.data.publish_at) : undefined,
    expiry_at: parsed.data.expiry_at ? new Date(parsed.data.expiry_at) : undefined,

    shuffle_questions: parsed.data.shuffle_questions,
    shuffle_options: parsed.data.shuffle_options,
    allow_reattempts: parsed.data.allow_reattempts,
    show_correct_answers: parsed.data.show_correct_answers,
    show_score_immediately: parsed.data.show_score_immediately,
  });

  reply.send(result);
}
