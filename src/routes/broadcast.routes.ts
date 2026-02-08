import { FastifyInstance } from 'fastify';
import { authGuard } from '../hooks/auth.guard';
import {
  sendPlatformBroadcastHandler,
  sendInstitutionBroadcastHandler,
  listInstitutionsForBroadcastHandler,
} from '../controllers/broadcast.controller';

export async function broadcastRoutes(app: FastifyInstance) {
  app.get(
    '/broadcast/institutions',
    { preHandler: [authGuard] },
    listInstitutionsForBroadcastHandler
  );

  app.post('/broadcast/platform', { preHandler: [authGuard] }, sendPlatformBroadcastHandler);

  app.post('/broadcast/institution', { preHandler: [authGuard] }, sendInstitutionBroadcastHandler);
}
