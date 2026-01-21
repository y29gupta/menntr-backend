import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth';
import { EmailService } from '../services/email';
import { Logger } from '../utils/logger';
import { ValidationError, UnauthorizedError, NotFoundError } from '../utils/errors';
import { config } from '../config';
import { token_type } from '@prisma/client';
import { Serializer } from '../utils/serializers';
import { CookieManager } from '../utils/cookie';



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



export async function validateForgotPasswordEmail(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);

  const parsed = ValidateEmailSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const { email } = parsed.data;
  const prisma = request.prisma;

  const user = await prisma.users.findFirst({
    where: { email, status: 'active' },
    select: { id: true },
  });

  if (!user) {
    logger.warn('Forgot password validation failed', { email, ip: request.ip });
    throw new NotFoundError('Email not found');
  }

  return reply.send({ valid: true });
}



export async function sendForgotPasswordEmail(request: FastifyRequest, reply: FastifyReply) {
  const emailService = new EmailService(request.server.mailer);
  const logger = new Logger(request.log);

  const parsed = SendResetSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const { email } = parsed.data;
  const prisma = request.prisma;

  const user = await prisma.users.findFirst({
    where: { email, status: 'active' },
  });

 
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

  await prisma.auth_tokens.create({
    data: {
      user_id: user.id,
      token_hash: hash,
      type: 'password_reset',
      expires_at: expiresAt,
    },
  });

  const resetLink = `${config.frontend.resetPasswordUrl}?token=${token}&email=${encodeURIComponent(
    email
  )}`;

  await emailService.sendPasswordReset(email, resetLink, user.first_name);

  logger.audit({
    user_id: user.id.toString(),
    action: 'SEND_PASSWORD_RESET',
    resource: 'auth',
    status: 'success',
    ip_address: request.ip,
    user_agent: request.headers['user-agent'],
  });

  return reply.send({
    message: 'If the email exists, a reset link has been sent.',
  });
}



export async function verifyResetToken(request: FastifyRequest, reply: FastifyReply) {
  const parsed = VerifyTokenSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const { email, token } = parsed.data;
  const prisma = request.prisma;

  const tokenHash = AuthService.sha256(token);

  const record = await prisma.auth_tokens.findFirst({
    where: {
      token_hash: tokenHash,
      type: 'password_reset',
      used_at: null,
      expires_at: { gt: new Date() },
      user: { email },
    },
  });

  if (!record) {
    throw new UnauthorizedError('Invalid or expired link');
  }

  return reply.send({ valid: true });
}



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

  const record = await prisma.auth_tokens.findFirst({
    where: {
      token_hash:tokenHash,
      type: 'password_reset',
      used_at: null,
      expires_at: { gt: new Date() },
      user: { email },
    },
    include: {
      user: {
        include: {
          user_roles: { include: { role: true } },
        },
      },
    },
  });

  if (!record || !record.user) {
    throw new UnauthorizedError('Invalid or expired link');
  }

  const passwordHash = await AuthService.hashPassword(newPassword);


  await prisma.$transaction([
    prisma.users.update({
      where: { id: record.user_id },
      data: {
        password_hash: passwordHash,
        must_change_password: false,
        status: 'active',
      },
    }),
    prisma.auth_tokens.updateMany({
      where: {
        user_id: record.user_id,
        type: 'password_reset',
      },
      data: { used_at: new Date() },
    }),
  ]);

  //  Serialize roles
  const roles = Serializer.serializeRoles(record.user);
  console.log("harish reset password", record)
  const jwtToken = AuthService.signJwt({
    sub: record.user_id.toString(),
    email: record.user.email,
    roles: roles.map((r: any) => r.name),
  });

  // Set auth cookie
  CookieManager.setAuthToken(reply, jwtToken);

  //  Notify user
  await emailService.sendPasswordChangedNotification(email);

  logger.audit({
    user_id: record.user_id.toString(),
    action: 'RESET_PASSWORD',
    resource: 'auth',
    status: 'success',
    ip_address: request.ip,
    user_agent: request.headers['user-agent'],
  });


  return reply.send({
    success: true,
    roles,
    must_change_password: false,
  });
}

