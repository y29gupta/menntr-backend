import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth';
import { EmailService } from '../services/email';
import { Serializer } from '../utils/serializers';
import { Logger } from '../utils/logger';
import { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } from '../utils/errors';
import { config } from '../config';

const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const InviteSchema = z.object({
  email: z.string().email('Invalid email format'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  institutionId: z.number().int().optional().nullable(),
});

const ConsumeInviteSchema = z.object({
  email: z.string().email('Invalid email format'),
  token: z.string().min(1, 'Token is required'),
});

const ChangePasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  oldPassword: z.string().optional(),
});

export async function loginHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);

  try {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      // FIXED: Use 'issues' instead of 'errors'
      throw new ValidationError('Invalid request', parsed.error.issues);
    }

    const { email, password } = parsed.data;
    const prisma = request.prisma;

    logger.info('Login attempt', { email, ip: request.ip });

    const user = await prisma.users.findFirst({ where: { email } });
    if (!user || !user.password_hash) {
      logger.warn('Login failed - invalid credentials', { email, ip: request.ip });
      throw new UnauthorizedError('Invalid credentials');
    }

    const isValidPassword = await AuthService.comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      logger.warn('Login failed - wrong password', { email, ip: request.ip });
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.status && user.status !== 'active') {
      logger.warn('Login failed - user not active', {
        email,
        status: user.status,
        ip: request.ip,
      });
      throw new ForbiddenError('User account is not active');
    }

    const userId = Serializer.bigIntToString(user.id);
    const jwtToken = AuthService.signJwt({ sub: userId, email: user.email }); // FIXED: Renamed

    // Update last login (fire and forget)
    prisma.users
      .update({
        where: { id: user.id },
        data: { last_login_at: new Date() },
      })
      .catch((err: string) => logger.warn('Failed to update last_login_at', { error: err }));

    logger.audit({
      userId,
      action: 'LOGIN',
      resource: 'auth',
      status: 'success',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send(Serializer.authResponse(user, jwtToken, !!user.must_change_password));
  } catch (error) {
    logger.error('Login failed', error as Error, { ip: request.ip });
    throw error;
  }
}

export async function generateInviteHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);

  try {
    const parsed = InviteSchema.safeParse(request.body);
    if (!parsed.success) {
      // FIXED: Use 'issues' instead of 'errors'
      throw new ValidationError('Invalid request', parsed.error.issues);
    }

    const { email, firstName, lastName, institutionId } = parsed.data;
    const prisma = request.prisma;
    const emailService = new EmailService(request.server.mailer);
    const currentUser = (request as any).user;

    logger.info('Generating invite', {
      email,
      institutionId,
      invitedBy: currentUser?.sub,
    });

    let user = await prisma.users.findFirst({
      where: {
        email,
        institution_id: institutionId ?? undefined,
      },
    });

    if (!user) {
      user = await prisma.users.create({
        data: {
          email,
          first_name: firstName ?? null,
          last_name: lastName ?? null,
          institution_id: institutionId ?? null,
          status: 'invited',
          must_change_password: true,
        },
      });
    }

    const { token: rawToken, hash: tokenHash } = AuthService.generateToken();
    const expiresAt = new Date(Date.now() + config.auth.otpExpiryMinutes * 60 * 1000);

    await prisma.auth_tokens.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        type: 'one_time_login',
        expires_at: expiresAt,
      },
    });

    const link = `${config.auth.oneTimeLinkBase}?token=${rawToken}&email=${encodeURIComponent(email)}`;

    try {
      await emailService.sendInvite(email, link, `${firstName ?? ''} ${lastName ?? ''}`.trim());
      logger.info('Invite email sent successfully', { email, userId: user.id });
    } catch (err) {
      logger.error('Failed to send invite email', err as Error, { email });
    }

    logger.audit({
      userId: currentUser?.sub,
      action: 'GENERATE_INVITE',
      resource: 'users',
      resourceId: Serializer.bigIntToString(user.id),
      status: 'success',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      metadata: { invitedEmail: email },
    });

    return reply.send({ message: 'Invitation sent successfully' });
  } catch (error) {
    logger.error('generateInvite failed', error as Error);
    throw error;
  }
}

export async function consumeInviteHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);

  try {
    const parsed = ConsumeInviteSchema.safeParse(request.body);
    if (!parsed.success) {
      // FIXED: Use 'issues' instead of 'errors'
      throw new ValidationError('Invalid request', parsed.error.issues);
    }

    const { email, token } = parsed.data;
    const prisma = request.prisma;
    const tokenHash = AuthService.sha256(token);
    const now = new Date();

    logger.info('Consuming invite', { email, ip: request.ip });

    const tokenRec = await prisma.auth_tokens.findFirst({
      where: {
        token_hash: tokenHash,
        type: 'one_time_login',
        used_at: null,
        expires_at: { gt: now },
      },
    });

    if (!tokenRec) {
      logger.warn('Invalid or expired invite token', { email, ip: request.ip });
      throw new UnauthorizedError('Invalid or expired invitation link');
    }

    const user = await prisma.users.findUnique({ where: { id: tokenRec.user_id } });
    if (!user || user.email !== email) {
      logger.warn('Token/email mismatch', { email, ip: request.ip });
      throw new UnauthorizedError('Invalid token or email');
    }

    // Mark all unused tokens for this user as used
    await prisma.auth_tokens.updateMany({
      where: { user_id: user.id, used_at: null },
      data: { used_at: new Date() },
    });

    const userId = Serializer.bigIntToString(user.id);

    logger.audit({
      userId,
      action: 'CONSUME_INVITE',
      resource: 'auth',
      status: 'success',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    if (user.must_change_password) {
      const tempToken = AuthService.signJwt({
        sub: userId,
        email: user.email,
        temp: true,
        must_change_password: true,
      });
      return reply.send({
        token: tempToken,
        mustChangePassword: true,
      });
    }

    const jwtToken = AuthService.signJwt({ sub: userId, email: user.email }); // FIXED: Renamed
    return reply.send({
      token: jwtToken,
      mustChangePassword: false,
    });
  } catch (error) {
    logger.error('consumeInvite failed', error as Error);
    throw error;
  }
}

export async function changePasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);

  try {
    const parsed = ChangePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      // FIXED: Use 'issues' instead of 'errors'
      throw new ValidationError('Invalid request', parsed.error.issues);
    }

    const { newPassword, oldPassword } = parsed.data;
    const payload = (request as any).user;

    if (!payload) {
      throw new UnauthorizedError();
    }

    const prisma = request.prisma;
    const userId = Number(payload.sub);

    logger.info('Password change request', { userId });

    const dbUser = await prisma.users.findUnique({ where: { id: userId } });
    if (!dbUser) {
      throw new NotFoundError('User not found');
    }

    // Verify old password if provided
    if (oldPassword) {
      const isValid = await AuthService.comparePassword(oldPassword, dbUser.password_hash || '');
      if (!isValid) {
        logger.warn('Password change failed - invalid old password', { userId });
        throw new UnauthorizedError('Invalid old password');
      }
    }

    const hashedPassword = await AuthService.hashPassword(newPassword);

    await prisma.users.update({
      where: { id: userId },
      data: {
        password_hash: hashedPassword,
        must_change_password: false,
        status: 'active',
      },
    });

    // Invalidate all unused tokens
    await prisma.auth_tokens.updateMany({
      where: { user_id: userId, used_at: null },
      data: { used_at: new Date() },
    });

    const jwtToken = AuthService.signJwt({
      // FIXED: Renamed
      sub: payload.sub,
      email: payload.email,
    });

    logger.audit({
      userId: payload.sub,
      action: 'CHANGE_PASSWORD',
      resource: 'users',
      resourceId: payload.sub,
      status: 'success',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({ token: jwtToken }); // FIXED: Use renamed variable
  } catch (error) {
    logger.error('changePassword failed', error as Error);
    throw error;
  }
}
