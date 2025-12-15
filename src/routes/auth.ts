// src/routes/auth.ts
import { FastifyInstance } from 'fastify';
import {
  loginHandler,
  generateInviteHandler,
  consumeInviteHandler,
  changePasswordHandler,
  logoutHandler,
} from '../controllers/auth.controller';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', loginHandler);
  fastify.post('/logout', logoutHandler);
  fastify.post('/invite', { preHandler: [(fastify as any).authenticate] }, generateInviteHandler);
  fastify.post('/consume-invite', consumeInviteHandler);
  fastify.post(
    '/change-password',
    { preHandler: [(fastify as any).authenticate] },
    changePasswordHandler
  );
}
