import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth';
import { EmailService } from '../services/email';
import { Serializer } from '../utils/serializers';
import { Logger } from '../utils/logger';
import { CookieManager } from '../utils/cookie';
import { ValidationError, UnauthorizedError, ForbiddenError, NotFoundError } from '../utils/errors';
import { config } from '../config';
import prisma from '../plugins/prisma';
import { resolveUserPermissions } from '../services/authorization.service';

import { getInstitutionAdminRole } from '../services/role.service';
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
  confirmNewPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function loginHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);

  try {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request', parsed.error.issues);
    }

    const { email, password } = parsed.data;
    const prisma = request.prisma;

    logger.info('Login attempt', { email, ip: request.ip });

    const user = await prisma.user.findFirst({
      where: { email },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const isValidPassword = await AuthService.comparePassword(password, user.passwordHash);

    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new ForbiddenError('User account is not active');
    }

    const userId = Serializer.bigIntToString(user.id);
    const roles = Serializer.serializeRoles(user); // [{ id, name }]
    const permissions = await resolveUserPermissions(prisma, user.id);

    const jwtToken = AuthService.signJwt({
      sub: userId,
      email: user.email,
      roles: roles.map((r: any) => r.name), // ONLY names in JWT
      permissions,
    });

    CookieManager.setAuthToken(reply, jwtToken);

    prisma.user
      .update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
      .catch(() => null);

    logger.audit({
      userId,
      action: 'LOGIN',
      resource: 'auth',
      status: 'success',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send(
      Serializer.authResponse(
        true,
        {
          id: userId,
          email: user.email,
          institutionId: user.institution_id,
          roles, // clean roles array
        },
        !!user.must_change_password
      )
    );
  } catch (error) {
    logger.error('Login failed', error as Error, { ip: request.ip });
    throw error;
  }
}

export async function logoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);
  const payload = (request as any).user;

  try {
    // Clear cookies
    CookieManager.clearAuthCookies(reply);

    // Invalidate tokens in database
    if (payload?.sub) {
      const prisma = request.prisma;
      await prisma.authToken.updateMany({
        where: { userId: Number(payload.sub), usedAt: null },
        data: { usedAt: new Date() },
      });

      logger.audit({
        userId: payload.sub,
        action: 'LOGOUT',
        resource: 'auth',
        status: 'success',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
    }
    reply.header('cache-control', 'no-store, no-cache, must-revalidate');
    reply.header('Pragma', 'no-cache');

    return reply.send({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout failed', error as Error);
    throw error;
  }
}


export async function generateInviteHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const logger = new Logger(request.log);

  try {
    const parsed = InviteSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request', parsed.error.issues);
    }

    const { email, firstName, lastName, institutionId } = parsed.data;
    const prisma = request.prisma;
    const emailService = new EmailService(request.server.mailer);
    const currentUser = (request as any).user;

    if (!institutionId) {
      throw new ValidationError('institutionId is required for invite');
    }

    logger.info('Generating invite', {
      email,
      institutionId,
      invitedBy: currentUser?.sub,
    });

let user = await prisma.user.findFirst({
  where: { email, institutionId },
});

if (!user) {
  user = await prisma.user.create({
    data: {
      email,
      firstName: firstName ?? null,
      lastName: lastName ?? null,
      institutionId,
      status: 'invited',
      mustChangePassword: true,
    },
  });
}

// 🔑 Resolve institution admin role dynamically
const institutionAdminRole = await prisma.role.findFirst({
  where: {
    institutionId,
    isSystemRole: false,
    parentId: null,
  },
});

// 🔗 Assign role to user
if (institutionAdminRole) {
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: institutionAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: institutionAdminRole.id,
      assignedBy: BigInt(currentUser?.sub),
    },
  });
}


    // 🔐 Create invite token
    const { token: rawToken, hash: tokenHash } = AuthService.generateToken();
    const expiresAt = new Date(
      Date.now() + config.auth.otpExpiryMinutes * 60 * 1000
    );

    await prisma.authToken.create({
      data: {
        userId: user.id,
        tokenHash,
        type: 'one_time_login',
        expiresAt,
      },
    });

    const link = `${config.auth.oneTimeLinkBase}?token=${rawToken}`;

    await emailService.sendInvite(email, link, 'institution', {
      recipientName: `${firstName ?? ''} ${lastName ?? ''}`.trim(),
    });

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

    const tokenRec = await prisma.authToken.findFirst({
      where: {
        tokenHash: tokenHash,
        type: 'one_time_login',
        usedAt: null,
        expiresAt: { gt: now },
      },
    });

    if (!tokenRec) {
      logger.warn('Invalid or expired invite token', { email, ip: request.ip });
      throw new UnauthorizedError('Invalid or expired invitation link');
    }

    const user = await prisma.user.findUnique({
      where: { id: tokenRec.userId },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });
    if (!user || user.email !== email) {
      logger.warn('Token/email mismatch', { email, ip: request.ip });
      throw new UnauthorizedError('Invalid token or email');
    }

    // Mark all unused tokens for this user as used
    await prisma.authToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
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

    if (user.mustChangePassword) {
      const roles = Serializer.serializeRoles(user);
      const permissions = await resolveUserPermissions(prisma, user.id);

      const tempToken = AuthService.signJwt({
        sub: userId,
        email: user.email,
        roles: roles.map((r: any) => r.name),
        permissions,
        temp: true,
        mustChangePassword: true,
      });
      return reply.send({
        token: tempToken,
        mustChangePassword: true,
      });
    }
    const roles = Serializer.serializeRoles(user);
    const jwtToken = AuthService.signJwt({
      sub: userId,
      email: user.email,
      roles: roles.map((r: any) => r.name),
    }); // FIXED: Renamed
    return reply.send({
      token: jwtToken,
      mustChangePassword: false,
    });
  } catch (error) {
    logger.error('consumeInvite failed', error as Error);
    throw error;
  }
}

export async function changePasswordHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const logger = new Logger(request.log);

  try {
    const parsed = ChangePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request', parsed.error.issues);
    }

    const { newPassword, confirmNewPassword } = parsed.data;
    const payload = (request as any).user;

    if (!payload) {
      throw new UnauthorizedError();
    }

    if (newPassword !== confirmNewPassword) {
      throw new ValidationError('Passwords do not match', [
        {
          path: ['confirmNewPassword'],
          message: 'Confirm password must match new password',
        },
      ]);
    }

    const prisma = request.prisma;
    const userId = Number(payload.sub);

    logger.info('Password change request', { userId });

    const userWithRoles = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
      },
    });

    if (!userWithRoles) {
      throw new NotFoundError('User not found');
    }

    const roles = Serializer.serializeRoles(userWithRoles);

    // 🔐 Hash password
    const passwordHash = await AuthService.hashPassword(newPassword);

    // ✅ Update user
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        status: 'active',
      },
    });

    // 🔒 Invalidate all tokens
    await prisma.authToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    const permissions = await resolveUserPermissions(prisma, userId);
    // 🎟 FINAL JWT
    const finalJwt = AuthService.signJwt({
      sub: payload.sub,
      email: payload.email,
      roles: roles.map((r: any) => r.name),
      permissions,
    });

    // 🍪 SET COOKIE (IMPORTANT)
    CookieManager.setAuthToken(reply, finalJwt);

    logger.audit({
      userId: payload.sub,
      action: 'CHANGE_PASSWORD',
      resource: 'users',
      resourceId: payload.sub,
      status: 'success',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    // ✅ NO TOKEN IN RESPONSE
    return reply.send({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    logger.error('changePassword failed', error as Error);
    throw error;
  }
}


