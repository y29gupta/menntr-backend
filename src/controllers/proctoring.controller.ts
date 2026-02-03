import { FastifyRequest, FastifyReply } from 'fastify';

type ProctoringEventBody = {
  attemptId: number;
  reason: string;
  videoPath: string;
  imagePath: string;
};

export async function saveEvent(
  req: FastifyRequest<{ Body: ProctoringEventBody }>,
  reply: FastifyReply
) {
  const { attemptId, reason, videoPath, imagePath } = req.body;

  await req.server.prisma.proctoring_events.create({
    data: {
      attempt_id: BigInt(attemptId),
      event_type: reason,
      video_url: videoPath,
      image_url: imagePath,
    },
  });

  reply.send({ success: true });
}
