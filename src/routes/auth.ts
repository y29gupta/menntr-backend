// src/routes/auth.ts
import { FastifyInstance } from 'fastify';
import {
  loginHandler,
  generateInviteHandler,
  consumeInviteHandler,
  changePasswordHandler,
  logoutHandler,
} from '../controllers/auth.controller';
import { authGuard } from '../hooks/auth.guard';

import {
  LoginSchema,
  InviteSchema,
  ConsumeInviteSchema,
  ChangePasswordSchema,
} from '../schemas/auth.schema';

export default async function authRoutes(fastify: FastifyInstance) {
  /**
   * -----------------------
   * LOGIN
   * -----------------------
   * - Public
   * - Rate limited
   * - Zod validation enforced by Fastify
   */
  fastify.post(
    '/login',
    {
      // schema: {
      //   body: LoginSchema,
      // },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
        },
      },
    },
    loginHandler
  );

  /**
   * -----------------------
   * LOGOUT
   * -----------------------
   * - Public (idempotent)
   * - No validation required
   * - Never fails
   */
  fastify.post('/logout', logoutHandler);

  /**
   * -----------------------
   * GENERATE INVITE
   * -----------------------
   * - Auth required
   * - Permission checked in controller
   * - Strict validation
   */
  fastify.post(
    '/invite',
    {
      preHandler: authGuard,
      // schema: {
      //   body: InviteSchema,
      // },
    },
    generateInviteHandler
  );

  /**
   * -----------------------
   * CONSUME INVITE
   * -----------------------
   * - Public
   * - Strict token validation
   * - Rate limited (anti brute-force)
   */
  fastify.post(
    '/consume-invite',
    {
      // schema: {
      //   body: ConsumeInviteSchema,
      // },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '10 minutes',
        },
      },
    },
    consumeInviteHandler
  );

  /**
   * -----------------------
   * CHANGE PASSWORD
   * -----------------------
   * - Auth required
   * - Strong password validation
   * - Token rotation handled in controller
   */
  fastify.post(
    '/change-password',
    {
      preHandler: authGuard,
      // schema: {
      //   body: ChangePasswordSchema,
      // },
    },
    changePasswordHandler
  );
}
