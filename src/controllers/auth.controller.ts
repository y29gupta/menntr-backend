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
 institutionCode: z.string().optional(),
});


const InviteSchema = z.object({
  email: z.string().email('Invalid email format'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  institutionId: z.number().int().optional().nullable(),
});

const ConsumeInviteSchema = z.object({
  token: z.string().min(20),
});


const ChangePasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmNewPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function loginHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const logger = new Logger(request.log);

  try {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request', parsed.error.issues);
    }

    const { email, password, institutionCode } = parsed.data;
    const prisma = request.prisma;

    logger.info('Login attempt', {
      email,
      institutionCode: institutionCode ?? 'SUPER_ADMIN',
      ip: request.ip,
    });


    if (!institutionCode) {
      const user = await prisma.user.findFirst({
        where: {
          email,
          institutionId: null,
          status: 'active',
        },
        include: {
          roles: {
            include: { role: true },
          },
        },
      });

      if (!user || !user.passwordHash) {
        throw new UnauthorizedError('Invalid credentials');
      }

      const valid = await AuthService.comparePassword(
        password,
        user.passwordHash
      );

      if (!valid) {
        throw new UnauthorizedError('Invalid credentials');
      }

      const roles = Serializer.serializeRoles(user);

      const isSuperAdmin = roles.some(
        (r: any) => r.name === 'Super Admin'
      );

      if (!isSuperAdmin) {
        throw new ForbiddenError('Not a super admin account');
      }

      const userId = Serializer.bigIntToString(user.id);
      const permissions = await resolveUserPermissions(prisma, user.id);

      const token = AuthService.signJwt({
        sub: userId,
        email: user.email,
        roles: roles.map((r: any) => r.name),
        permissions,
        isSuperAdmin: true,
      });

      CookieManager.setAuthToken(reply, token);

      return reply.send(
        Serializer.authResponse(true, {
          id: userId,
          email: user.email,
          roles,
          isSuperAdmin: true,
        })
      );
    }


    const institution = await prisma.institution.findUnique({
      where: { code: institutionCode },
    });

    if (!institution) {
      throw new UnauthorizedError('Invalid institution code');
    }

    const user = await prisma.user.findUnique({
      where: {
        email_institutionId: {
          email,
          institutionId: institution.id,
        },
      },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const valid = await AuthService.comparePassword(
      password,
      user.passwordHash
    );

    if (!valid) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new ForbiddenError('User account is not active');
    }

    const userId = Serializer.bigIntToString(user.id);
    const roles = Serializer.serializeRoles(user);
    const permissions = await resolveUserPermissions(prisma, user.id);

    const token = AuthService.signJwt({
      sub: userId,
      email: user.email,
      institutionId: institution.id,
      roles: roles.map((r: any) => r.name),
      permissions,
    });

    CookieManager.setAuthToken(reply, token);

    return reply.send(
      Serializer.authResponse(true, {
        id: userId,
        email: user.email,
        institutionId: institution.id,
        roles,
      })
    );
  } catch (error) {
    logger.error('Login failed', error as Error);
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

    const userWasExisting = !!user;

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


    if (!userWasExisting) {
      const institutionAdminRole = await prisma.role.findFirst({
        where: {
          institutionId,
          isSystemRole: false,
          parentId: null,
        },
      });

      if (!institutionAdminRole) {
        throw new Error('Institution admin role not configured');
      }

      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: institutionAdminRole.id,
          assignedBy: BigInt(currentUser?.sub),
        },
      });
    }


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
      recipientName: `${firstName ?? ''} ${lastName ?? ''}`.trim()
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



export async function consumeInviteHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const logger = new Logger(request.log);

  const parsed = ConsumeInviteSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const { token } = parsed.data;
  const prisma = request.prisma;
  const tokenHash = AuthService.sha256(token);

  const tokenRec = await prisma.authToken.findFirst({
    where: {
      tokenHash,
      type: 'one_time_login',
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      user: {
        include: {
          roles: { include: { role: true } },
        },
      },
    },
  });

  if (!tokenRec || !tokenRec.user) {
    throw new UnauthorizedError('Invalid or expired invitation link');
  }

  // mark token as used
await prisma.authToken.updateMany({
  where: {
    userId: tokenRec.userId,
    usedAt: null,
  },
  data: { usedAt: new Date() },
});


  const user = tokenRec.user;
  const roles = Serializer.serializeRoles(user);
  const permissions = await resolveUserPermissions(prisma, user.id);

  const jwtPayload: any = {
    sub: user.id.toString(),
    email: user.email,
    roles: roles.map((r: any) => r.name),
    permissions,
  };

  if (user.mustChangePassword) {
    jwtPayload.temp = true;
    jwtPayload.mustChangePassword = true;
  }

  const jwt = AuthService.signJwt(jwtPayload);

  return reply.send({
    token: jwt,
    mustChangePassword: user.mustChangePassword,
  });
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

    //  Hash password
    const passwordHash = await AuthService.hashPassword(newPassword);

    //  Update user
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        status: 'active',
      },
    });

    //  Invalidate all tokens
    await prisma.authToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    const permissions = await resolveUserPermissions(prisma, userId);
    //  FINAL JWT
    const finalJwt = AuthService.signJwt({
      sub: payload.sub,
      email: payload.email,
      roles: roles.map((r: any) => r.name),
      permissions,
    });

    //  SET COOKIE 
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

    return reply.send({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    logger.error('changePassword failed', error as Error);
    throw error;
  }
}


