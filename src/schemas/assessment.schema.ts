import { z } from 'zod';


export const CreateAssessmentSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().optional(),

  duration_minutes: z.number().int().min(5).max(300),

  tags: z.array(z.string()).optional(),

  category: z.string().min(2).max(50),

  assessment_type: z.enum(['practice', 'mock', 'assignment']),

  question_type: z.enum(['mcq', 'coding', 'manual']),
});


export const AssignAudienceSchema = z
  .object({
    batch_ids: z.array(z.number().int().positive()).min(1),
  })
  .strict();

export const AddQuestionSchema = z
  .object({
    question_id: z.bigint(),
    points: z.number().min(0),
    negative_points: z.number().min(0).optional(),
    is_mandatory: z.boolean().optional(),
    sort_order: z.number().int().optional(),
    section_name: z.string().trim().max(100).optional(),
  })
  .strict();

export const BulkAddQuestionsSchema = z
  .object({
    question_ids: z.array(
      z
        .union([z.number().int().positive(), z.string().regex(/^\d+$/, 'Invalid ID')])
        .transform((v) => BigInt(v))
    ),
  })
  .strict();

export const ScheduleSchema = z
  .object({
    publish_at: z.string().datetime(),
    expiry_at: z.string().datetime().optional(),
  })
  .strict();

export const UpdateAccessSchema = z
  .object({
    shuffle_questions: z.boolean(),
    shuffle_options: z.boolean(),
    allow_reattempts: z.boolean(),
    show_correct_answers: z.boolean(),
    show_score_immediate: z.boolean(),
  })
  .strict();
