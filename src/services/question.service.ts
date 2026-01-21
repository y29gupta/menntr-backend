import { PrismaClient, QuestionDifficulty, QuestionType } from '@prisma/client';
import crypto from 'crypto';

export async function findOrCreateQuestion(
  prisma: PrismaClient,
  input: {
    institution_id: number;
    created_by: bigint;
    question_text: string;
    question_type: QuestionType;
    difficulty_level: QuestionDifficulty;
    points: number;
    tags: string[];
    metadata?: any;
    options?: { option_text: string; is_correct: boolean }[];
  }
) {
  // 1️⃣ Try exact match
  const existing = await prisma.question_bank.findFirst({
    where: {
      institution_id: input.institution_id,
      question_text: input.question_text,
      question_type: input.question_type,
    },
  });

  if (existing) {
    return existing;
  }

  // 2️⃣ Create new question
  const question = await prisma.question_bank.create({
    data: {
      institution_id: input.institution_id,
      created_by: input.created_by,
      question_text: input.question_text,
      question_type: input.question_type,
      difficulty_level: input.difficulty_level,
      default_points: input.points,
      tags: input.tags,
      metadata: input.metadata ?? {},
    },
  });

  // 3️⃣ Options (MCQ only)
  if (input.options?.length) {
    await prisma.question_options.createMany({
      data: input.options.map((o, i) => ({
        question_id: question.id,
        option_text: o.option_text,
        option_label: String.fromCharCode(65 + i),
        is_correct: o.is_correct,
        sort_order: i,
      })),
    });
  }

  return question;
}
