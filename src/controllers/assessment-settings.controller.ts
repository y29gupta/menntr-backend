import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../services/assessment-settings.service';

export type UpdateAssessmentSettingsBody = {
  reattemptRules?: {
    enabled?: boolean;
    assignAbsent?: boolean;
    scoreBelow?: number | null;
    scoreAbove?: number | null;
    previousAssessmentId?: bigint | null;
  };
  testConfig?: {
    reportVisibility?: boolean;
    navigationMode?: boolean;
    tabProctoring?: boolean;
    cameraProctoring?: boolean;
    fullScreenRecording?: boolean;
  };
};

export async function getAssessmentSettingsHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.getAssessmentSettings(
    req.prisma,
    BigInt(req.params.id),
    user.institution_id
  );

  reply.send(data);
}

export async function updateAssessmentSettingsHandler(
  req: FastifyRequest<{
    Params: { id: string };
    Body: UpdateAssessmentSettingsBody;
  }>,
  reply: FastifyReply
) {
  const user = req.user as any;

  const data = await service.updateAssessmentSettings(
    req.prisma,
    BigInt(req.params.id),
    user.institution_id,
    req.body
  );

  reply.send({ success: true, data });
}
