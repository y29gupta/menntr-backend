import { FastifyRequest, FastifyReply } from 'fastify';
import * as service from '../services/notification.service';

export async function getNotificationsHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const data = await service.getGroupedNotifications(req.server.prisma, BigInt(user.sub));

  return reply.send(data);
}

export async function getUnreadCountHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  const count = await service.getUnreadCount(req.server.prisma, BigInt(user.sub));

  return reply.send({ unread_count: count });
}

export async function markNotificationReadHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  // ✅ SAFE param extraction
  const { id } = req.params as { id: string };

  if (!id) {
    return reply.code(400).send({ error: 'Notification id is required' });
  }

  await service.markAsRead(req.server.prisma, BigInt(id), BigInt(user.sub));

  return reply.send({ success: true });
}

export async function markAllNotificationsReadHandler(req: FastifyRequest, reply: FastifyReply) {
  const user = req.user as any;

  await service.markAllAsRead(req.server.prisma, BigInt(user.sub));

  return reply.send({ success: true });
}
