import { FastifyInstance } from 'fastify';
import { authGuard } from '../hooks/auth.guard';
import {
  getNotificationsHandler,
  getUnreadCountHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler,
} from '../controllers/notification.controller';

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/notifications', { preHandler: [authGuard] }, getNotificationsHandler);

  app.get('/notifications/unread-count', { preHandler: [authGuard] }, getUnreadCountHandler);

  app.post('/notifications/:id/read', { preHandler: [authGuard] }, markNotificationReadHandler);

  app.post('/notifications/read-all', { preHandler: [authGuard] }, markAllNotificationsReadHandler);
}
