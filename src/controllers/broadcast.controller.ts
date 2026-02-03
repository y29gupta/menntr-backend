import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../services/broadcast.service';

export async function listInstitutionsForBroadcastHandler(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const user = req.user as any;

  if (!user.roles?.includes('Super Admin')) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  return reply.send(await service.listInstitutions(req.server.prisma));
}

/**
 * Super Admin → Platform Announcement
 */
export async function sendPlatformBroadcastHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  if (!user.roles?.includes('Super Admin')) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const body = req.body as {
    title: string;
    message: string;
    institution_ids?: number[]; // optional
  };

  await service.sendPlatformBroadcast(req.server.prisma, {
    title: body.title,
    message: body.message,
    institution_ids: body.institution_ids ?? [],
    created_by: BigInt(user.sub),
  });

  return reply.send({ success: true });
}

/**
 * Institution Admin → Institution Announcement
 */
export async function sendInstitutionBroadcastHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  if (!user.roles?.includes('Institution Admin')) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const body = req.body as {
    title: string;
    message: string;
  };

  await service.sendInstitutionBroadcast(req.server.prisma, {
    title: body.title,
    message: body.message,
    institution_id: user.institution_id,
    created_by: BigInt(user.sub),
  });

  return reply.send({ success: true });
}
