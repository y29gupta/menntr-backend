import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../../services/student/student-assessment.runtime.service';

/* ---------------- TYPES ---------------- */

type AssessmentParams = {
  assessmentId: string;
};

type QuestionParams = {
  assessmentId: string;
  index: string;
};

type FlagParams = {
  assessmentId: string;
  questionId: string;
};

type McqAnswerBody = {
  assessment_question_id: string;
  question_id: string;
  selected_option_ids: string[];
  time_taken_seconds?: number;
};

type RunCodingBody = {
  question_id: string;
  language: string;
  source_code: string;
};

type SaveCodingBody = {
  question_id: string;
  language: string;
  source_code: string;
  // max_points: number;
};

type FlagBody = {
  is_flagged: boolean;
};

/* ---------------- HANDLERS ---------------- */

export async function getRuntimeConfigHandler(
  req: FastifyRequest<{ Params: AssessmentParams }>,
  reply: FastifyReply
) {
  const u = req.user as any;

  reply.send(
    await service.getRuntimeConfig(req.prisma, {
      student_id: BigInt(u.sub),
      institution_id: u.institution_id,
      assessment_id: BigInt(req.params.assessmentId),
    })
  );
}

export async function getQuestionHandler(
  req: FastifyRequest<{ Params: QuestionParams }>,
  reply: FastifyReply
) {
  const u = req.user as any;

  reply.send(
    await service.getQuestion(req.prisma, {
      student_id: BigInt(u.sub),
      assessment_id: BigInt(req.params.assessmentId),
      index: Number(req.params.index),
    })
  );
}

export async function saveMcqAnswerHandler(
  req: FastifyRequest<{ Params: AssessmentParams; Body: McqAnswerBody }>,
  reply: FastifyReply
) {
  const u = req.user as any;

  reply.send(
    await service.saveMcqAnswer(req.prisma, {
      student_id: BigInt(u.sub),
      assessment_id: BigInt(req.params.assessmentId),
      assessment_question_id: BigInt(req.body.assessment_question_id),
      question_id: BigInt(req.body.question_id),
      selected_option_ids: req.body.selected_option_ids.map(BigInt),
      time_taken_seconds: req.body.time_taken_seconds,
    })
  );
}

export async function runCodingHandler(
  req: FastifyRequest<{ Params: AssessmentParams; Body: RunCodingBody }>,
  reply: FastifyReply
) {
  const u = req.user as any;

  reply.send(
    await service.runCoding(req.prisma, {
      student_id: BigInt(u.sub),
      assessment_id: BigInt(req.params.assessmentId),
      question_id: BigInt(req.body.question_id),
      language: req.body.language,
      source_code: req.body.source_code,
    })
  );
}

export async function saveCodingSubmissionHandler(
  req: FastifyRequest<{ Params: AssessmentParams; Body: SaveCodingBody }>,
  reply: FastifyReply
) {
  const u = req.user as any;

  reply.send(
    await service.saveCodingSubmission(req.prisma, {
      student_id: BigInt(u.sub),
      assessment_id: BigInt(req.params.assessmentId),
      question_id: BigInt(req.body.question_id),
      language: req.body.language,
      source_code: req.body.source_code,
      // max_points: req.body.max_points,
    })
  );
}

export async function flagQuestionHandler(
  req: FastifyRequest<{ Params: FlagParams; Body: FlagBody }>,
  reply: FastifyReply
) {
  const u = req.user as any;

  reply.send(
    await service.flagQuestion(req.prisma, {
      student_id: BigInt(u.sub),
      assessment_id: BigInt(req.params.assessmentId),
      assessment_question_id: BigInt(req.params.questionId),
      is_flagged: req.body.is_flagged,
    })
  );
}

export async function getSubmitPreviewHandler(
  req: FastifyRequest<{ Params: AssessmentParams }>,
  reply: FastifyReply
) {
  const u = req.user as any;

  reply.send(
    await service.getSubmitPreview(req.prisma, {
      student_id: BigInt(u.sub),
      assessment_id: BigInt(req.params.assessmentId),
    })
  );
}

export async function submitAssessmentHandler(
  req: FastifyRequest<{ Params: AssessmentParams }>,
  reply: FastifyReply
) {
  const u = req.user as any;

  reply.send(
    await service.submitAssessment(req.prisma, {
      student_id: BigInt(u.sub),
      assessment_id: BigInt(req.params.assessmentId),
    })
  );
}
