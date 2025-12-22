import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth';
import { EmailService } from '../services/email';
import { Logger } from '../utils/logger';
import { ValidationError, UnauthorizedError, NotFoundError } from '../utils/errors';
import { config } from '../config';
import { TokenType } from '@prisma/client';

/* ------------------------------------------------------------------ */
/* Schemas */
/* ------------------------------------------------------------------ */

const ValidateEmailSchema = z.object({
  email: z.string().email(),
});

const SendResetSchema = z.object({
  email: z.string().email(),
});

const VerifyTokenSchema = z.object({
  email: z.string().email(),
  token: z.string().min(20),
});

const ResetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(20),
  newPassword: z.string().min(8),
});

/* ------------------------------------------------------------------ */
/* 1. VALIDATE EMAIL */
/* ------------------------------------------------------------------ */

export async function validateForgotPasswordEmail(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);

  const parsed = ValidateEmailSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const { email } = parsed.data;
  const prisma = request.prisma;

  const user = await prisma.user.findFirst({
    where: { email, status: 'active' },
    select: { id: true },
  });

  if (!user) {
    logger.warn('Forgot password validation failed', { email, ip: request.ip });
    throw new NotFoundError('Email not found');
  }

  return reply.send({ valid: true });
}

/* ------------------------------------------------------------------ */
/* 2. SEND RESET PASSWORD EMAIL */
/* ------------------------------------------------------------------ */

export async function sendForgotPasswordEmail(request: FastifyRequest, reply: FastifyReply) {
  const emailService = new EmailService(request.server.mailer);
  const logger = new Logger(request.log);

  const parsed = SendResetSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const { email } = parsed.data;
  const prisma = request.prisma;

  const user = await prisma.user.findFirst({
    where: { email, status: 'active' },
  });

  // IMPORTANT: Enumeration-safe response
  if (!user) {
    logger.warn('Forgot password email requested for non-existent user', {
      email,
      ip: request.ip,
    });
    return reply.send({
      message: 'If the email exists, a reset link has been sent.',
    });
  }

  const { token, hash } = AuthService.generateToken();
  const expiresAt = new Date(Date.now() + config.auth.resetTokenExpiryMinutes * 60 * 1000);

  await prisma.authToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      type: TokenType.one_time_login,
      expiresAt: expiresAt,
    },
  });

  const resetLink = `${config.frontend.resetPasswordUrl}?token=${token}&email=${encodeURIComponent(
    email
  )}`;

  await emailService.sendPasswordReset(email, resetLink, user.first_name);

  logger.audit({
    userId: user.id.toString(),
    action: 'SEND_PASSWORD_RESET',
    resource: 'auth',
    status: 'success',
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({
    message: 'If the email exists, a reset link has been sent.',
  });
}

/* ------------------------------------------------------------------ */
/* 3. VERIFY RESET TOKEN */
/* ------------------------------------------------------------------ */

export async function verifyResetToken(request: FastifyRequest, reply: FastifyReply) {
  const parsed = VerifyTokenSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const { email, token } = parsed.data;
  const prisma = request.prisma;

  const tokenHash = AuthService.sha256(token);

  const record = await prisma.authToken.findFirst({
    where: {
      tokenHash: tokenHash,
      type: TokenType.one_time_login,
      usedAt: null,
      expiresAt: { gt: new Date() },
      user: { email },
    },
  });

  if (!record) {
    throw new UnauthorizedError('Invalid or expired link');
  }

  return reply.send({ valid: true });
}

/* ------------------------------------------------------------------ */
/* 4. RESET PASSWORD */
/* ------------------------------------------------------------------ */

export async function resetPassword(request: FastifyRequest, reply: FastifyReply) {
  const emailService = new EmailService(request.server.mailer);
  const logger = new Logger(request.log);

  const parsed = ResetPasswordSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const { email, token, newPassword } = parsed.data;
  const prisma = request.prisma;

  const tokenHash = AuthService.sha256(token);

  const record = await prisma.authToken.findFirst({
    where: {
      tokenHash: tokenHash,
      type: TokenType.one_time_login,
      usedAt: null,
      expiresAt: { gt: new Date() },
      user: { email },
    },
    include: { user: true },
  });

  if (!record) {
    throw new UnauthorizedError('Invalid or expired link');
  }

  const passwordHash = await AuthService.hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: passwordHash,
        mustChangePassword: false,
      },
    }),
    prisma.authToken.updateMany({
      where: {
        userId: record.userId,
        type: TokenType.one_time_login,
      },
      data: { usedAt: new Date() },
    }),
  ]);

  await emailService.sendPasswordChangedNotification(email);

  logger.audit({
    userId: record.userId.toString(),
    action: 'RESET_PASSWORD',
    resource: 'auth',
    status: 'success',
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ success: true });
}
