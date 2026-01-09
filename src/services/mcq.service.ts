import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { PrismaClient, QuestionDifficulty } from '@prisma/client';
import { ConflictError } from '../utils/errors';

export interface BulkUploadMcqInput {
  fileName: string;
  buffer: Buffer;
  institution_id: number;
  user_id: bigint;
}

export async function bulkUploadMcqs(
  prisma: PrismaClient,
  input: BulkUploadMcqInput
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
  // Insert questions (NO TRANSACTION)
  // ------------------------
  for (const row of rows) {
    const questionText = row['Question'];
    const topic = row['Question Topic'];
    const subTopic = row['Sub Topic'];
    const correctAnswer = row['Correct Answer'];
    const difficultyRaw = row['Difficulty Level']?.toLowerCase();
    const score = Number(row['Score']) || 1;

    if (!questionText || !correctAnswer) {
      skipped++;
      continue;
    }

    const question = await prisma.question_bank.create({
      data: {
        institution_id: input.institution_id,
        created_by: input.user_id,
        question_text: questionText,
        difficulty_level: difficultyMap[difficultyRaw] ?? 'medium',
        default_points: score,
        metadata: {
          topic,
          sub_topic: subTopic,
        },
        tags: [topic, subTopic].filter(Boolean),
      },
    });

    const answers = [
      row['Answer 1'],
      row['Answer 2'],
      row['Answer 3'],
      row['Answer 4'],
    ];

    const labels = ['A', 'B', 'C', 'D'];

    for (let i = 0; i < answers.length; i++) {
      if (!answers[i]) continue;

      await prisma.question_options.create({
        data: {
          question_id: question.id,
          option_label: labels[i],
          option_text: answers[i],
          is_correct: answers[i] === correctAnswer,
        },
      });
    }

    created++;
  }

  return {
    success: true,
    uploaded_questions: created,
    skipped_rows: skipped,
  };
}
