import { FastifyRequest, FastifyReply } from 'fastify';
import { bulkCreateMcqForAssessment, bulkUploadMcqs } from '../services/mcq.service';

export async function bulkUploadMcqHandler(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const file = await (req as any).file();

  if (!file) {
    return reply.status(400).send({
      message: 'CSV or Excel file is required',
    });
  }

  const user = req.user as any;

  const result = await bulkUploadMcqs(
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

  const result = await bulkCreateMcqForAssessment(req.prisma, {
    assessment_id: BigInt(req.params.id),
    institution_id: user.institution_id,
    created_by: BigInt(user.sub),
    fileName: file.filename,
    buffer: await file.toBuffer(),
  });

  reply.send(result);
}
