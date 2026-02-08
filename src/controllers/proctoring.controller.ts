import { FastifyRequest, FastifyReply } from 'fastify';
import { ProctoringEventType } from '@prisma/client';

type ProctoringEventBody = {
  attemptId: number;
  reason: string;
  videoPath: string;
  imagePath: string;
};

function mapReasonToEventType(reason: string): ProctoringEventType {
  switch (reason) {
    case 'Tab switched':
    case 'Window lost focus':
      return ProctoringEventType.TAB_SWITCH;

    case 'Camera turned off':
    case 'Camera blocked':
      return ProctoringEventType.CAMERA_OFF;

    default:
      return ProctoringEventType.SUSPICIOUS_ACTIVITY;
  }
}

export async function saveEvent(
  req: FastifyRequest<{ Body: ProctoringEventBody }>,
  reply: FastifyReply
) {
  const { attemptId, reason, videoPath, imagePath } = req.body;

  const eventType = mapReasonToEventType(reason);

  await req.server.prisma.proctoring_events.create({
    data: {
      attempt_id: BigInt(attemptId),
      event_type: eventType,
      video_url: videoPath,
      image_url: imagePath,
    },
  });

  reply.send({ success: true });
}
