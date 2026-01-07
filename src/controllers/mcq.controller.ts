import { FastifyRequest, FastifyReply } from 'fastify';
import { bulkUploadMcqs } from '../services/mcq.service';

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
