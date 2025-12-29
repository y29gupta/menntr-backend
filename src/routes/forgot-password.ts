import { FastifyInstance } from 'fastify';
import {
  validateForgotPasswordEmail,
  sendForgotPasswordEmail,
  verifyResetToken,
  resetPassword,
} from '../controllers/forgot-password.controller';

export async function forgotPasswordRoutes(app: FastifyInstance) {
  app.post('/auth/forgot-password/validate', validateForgotPasswordEmail);
  app.post('/auth/forgot-password/send', sendForgotPasswordEmail);
  app.post('/auth/forgot-password/verify', verifyResetToken);
  app.post('/auth/forgot-password/reset', resetPassword);
}
