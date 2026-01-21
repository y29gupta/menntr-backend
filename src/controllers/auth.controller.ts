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

// import { getInstitutionAdminRole } from '../services/role.service';
import { token_type } from '@prisma/client';
import { LoginSchema, ChangePasswordSchema, ConsumeInviteSchema, InviteSchema } from '../schemas/auth.schema';

export async function loginHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);
  const requestId = request.id;
  const prisma = request.prisma;

  try {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      logger.warn('LOGIN_VALIDATION_FAILED', {
        requestId,
        issues: parsed.error.issues,
      });
      throw new ValidationError('Invalid request', parsed.error.issues);
    }

    const { email, password, institution_code } = parsed.data;

    logger.info('LOGIN_ATTEMPT', {
      requestId,
      email_hash: AuthService.hashForLog(email),
      context: institution_code ? 'INSTITUTION' : 'SUPER_ADMIN',
      ip: request.ip,
    });

    const dummyHash = '$2b$10$C6UzMDM.H6dfI/f/IKcEeO4Gx3yZ7pE6s1Z6pJ9XyM54q9WlH0y2K';

    let user = null;
    let institutionId: bigint | null = null;

    if (institution_code) {
      const institution = await prisma.institutions.findUnique({
        where: { code: institution_code },
      });

      if (institution) {
        institutionId = institution.id;
        user = await prisma.users.findUnique({
          where: {
            email_institution_id: {
              email,
              institution_id: institution.id,
            },
          },
          include: { user_roles: { include: { role: true } } },
        });
      }
    } else {
      user = await prisma.users.findFirst({
        where: { email, institution_id: null, status: 'active' },
        include: { user_roles: { include: { role: true } } },
      });
    }

    const passwordHash = user?.password_hash ?? dummyHash;
    const valid = await AuthService.comparePassword(password, passwordHash);

    if (!user || !valid || user.status !== 'active') {
      logger.warn('LOGIN_FAILED', {
        requestId,
        reason: 'INVALID_CREDENTIALS',
        context: institution_code ? 'INSTITUTION' : 'SUPER_ADMIN',
      });
      throw new UnauthorizedError('Invalid credentials');
    }

    await prisma.users.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    const roles = Serializer.serializeRoles(user);
    const permissions = await resolveUserPermissions(prisma, user.id);

    const token = AuthService.signJwt({
      sub: Serializer.bigIntToString(user.id),
      email: user.email,
      institution_id: institutionId ?? undefined,
      roles: roles.map((r: any) => r.name),
      permissions,
      isSuperAdmin: !institution_code,
    });

    CookieManager.setAuthToken(reply, token);

    logger.audit({
      user_id: Serializer.bigIntToString(user.id),
      action: 'LOGIN_SUCCESS',
      resource: 'users',
      status: 'success',
      ip_address: request.ip,
      metadata: { requestId },
    });

    return reply.send(
      Serializer.authResponse(true, {
        id: Serializer.bigIntToString(user.id),
        roles,
        isSuperAdmin: !institution_code,
      })
    );
  } catch (error) {
    logger.error('LOGIN_ERROR', error as Error, { requestId });
    throw error;
  }
}

export async function logoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);
  const requestId = request.id;
  const user = (request as any).user;

  try {
    logger.info('LOGOUT_REQUEST', {
      requestId,
      userId: user?.sub ?? null,
      ip: request.ip,
    });

    CookieManager.clearAuthCookies(reply);

    if (user?.sub) {
      logger.audit({
        user_id: user.sub,
        action: 'LOGOUT',
        resource: 'auth',
        status: 'success',
        ip_address: request.ip,
        metadata: { requestId },
      });
    } else {
      logger.info('LOGOUT_NO_SESSION', { requestId });
    }

    reply
      .header('cache-control', 'no-store, no-cache, must-revalidate')
      .header('pragma', 'no-cache');

    return reply.code(200).send({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('LOGOUT_INTERNAL_ERROR', error as Error, { requestId });
    CookieManager.clearAuthCookies(reply);
    return reply.code(200).send({
      success: true,
      message: 'Logged out successfully',
    });
  }
}

export async function generateInviteHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);
  const requestId = request.id;

  try {
    const currentUser = (request as any).user;
    if (!currentUser?.sub) {
      throw new UnauthorizedError();
    }
    // if (!currentUser.permissions?.includes('user:invite')) {
    //   throw new ForbiddenError('Insufficient permissions');
    // }
    const parsed = InviteSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request', parsed.error.issues);
    }

    const { email, first_name, last_name, institution_id } = parsed.data;
    const prisma = request.prisma;

    if (!institution_id) {
      throw new ValidationError('institutionId is required');
    }

    logger.info('INVITE_REQUEST', {
      requestId,
      email_hash: AuthService.hashForLog(email),
      institution_id,
      invited_by: currentUser?.sub,
    });

    let user = await prisma.users.findFirst({
      where: { email, institution_id },
    });

    const isNewUser = !user;

    if (!user) {
      user = await prisma.users.create({
        data: {
          email,
          first_name: first_name ?? null,
          last_name: last_name ?? null,
          institution_id,
          status: 'active',
          must_change_password: true,
        },
      });
    }

    if (isNewUser) {
      const role = await prisma.roles.findFirst({
        where: { institution_id, parent_id: null },
      });

      if (!role) {
        throw new ForbiddenError('Institution roles not configured');
      }

      await prisma.user_roles.create({
        data: {
          user_id: user.id,
          role_id: role.id,
          assigned_by: BigInt(currentUser.sub),
        },
      });
    }

    const { token, hash } = AuthService.generateToken();
    const expiresAt = new Date(Date.now() + config.auth.otpExpiryMinutes * 60 * 1000);

    await prisma.auth_tokens.create({
      data: {
        user_id: user.id,
        token_hash: hash,
        type: token_type.email_verification,
        expires_at: expiresAt,
      },
    });

    await new EmailService(request.server.mailer).sendInvite(
      email,
      `${config.auth.oneTimeLinkBase}?token=${token}`,
      'institution'
    );

    logger.audit({
      user_id: currentUser.sub,
      action: 'INVITE_SENT',
      resource: 'users',
      resource_id: Serializer.bigIntToString(user.id),
      status: 'success',
      metadata: { requestId },
    });

    return reply.send({ message: 'Invitation sent successfully' });
  } catch (error) {
    logger.error('INVITE_FAILED', error as Error, { requestId });
    throw error;
  }
}

export async function consumeInviteHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);
  const requestId = request.id;

  const parsed = ConsumeInviteSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const tokenHash = AuthService.sha256(parsed.data.token);
  const prisma = request.prisma;

  const tokenRec = await prisma.auth_tokens.findFirst({
    where: {
      token_hash: tokenHash,
      type: token_type.email_verification,
      used_at: null,
      expires_at: { gt: new Date() },
    },
    include: { user: { include: { user_roles: { include: { role: true } } } } },
  });

  if (!tokenRec?.user) {
    logger.warn('INVITE_CONSUME_FAILED', { requestId });
    throw new UnauthorizedError('Invalid or expired invitation link');
  }

  await prisma.auth_tokens.update({
    where: { id: tokenRec.id },
    data: { used_at: new Date() },
  });

  const roles = Serializer.serializeRoles(tokenRec.user);
  const permissions = await resolveUserPermissions(prisma, tokenRec.user.id);

  const jwt = AuthService.signJwt({
    sub: tokenRec.user.id.toString(),
    roles: roles.map((r: any) => r.name),
    permissions,
    must_change_password: tokenRec.user.must_change_password,
  });

  logger.audit({
    user_id: tokenRec.user.id.toString(),
    action: 'INVITE_CONSUMED',
    resource: 'auth',
    status: 'success',
    metadata: { requestId },
  });

  return reply.send({
    token: jwt,
    must_change_password: tokenRec.user.must_change_password,
  });
}

export async function changePasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);
  const requestId = request.id;
  const prisma = request.prisma;

  try {
    const userPayload = (request as any).user;
    if (!userPayload?.sub) {
      logger.warn('CHANGE_PASSWORD_UNAUTHENTICATED', { requestId });
      throw new UnauthorizedError('Unauthorized');
    }

    const parsed = ChangePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      logger.warn('CHANGE_PASSWORD_VALIDATION_FAILED', {
        requestId,
        issues: parsed.error.issues,
      });

      throw new ValidationError('Invalid request', parsed.error.issues);
    }

    const { new_password } = parsed.data;
    const userId = Number(userPayload.sub);

    logger.info('CHANGE_PASSWORD_ATTEMPT', {
      requestId,
      userId: userPayload.sub,
      ip: request.ip,
    });

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password_hash: true,
        status: true,
      },
    });

    if (!user || user.status !== 'active') {
      logger.warn('CHANGE_PASSWORD_USER_INVALID', {
        requestId,
        userId: userPayload.sub,
      });

      throw new ForbiddenError('Operation not allowed');
    }

    if (user.password_hash) {
      const isSame = await AuthService.comparePassword(new_password, user.password_hash);

      if (isSame) {
        logger.warn('CHANGE_PASSWORD_REUSED_PASSWORD', {
          requestId,
          userId: userPayload.sub,
        });

        throw new ValidationError('New password must be different from old one');
      }
    }

    const newHash = await AuthService.hashPassword(new_password);

    await prisma.users.update({
      where: { id: userId },
      data: {
        password_hash: newHash,
        must_change_password: false,
        status: 'active',
      },
    });

    await prisma.auth_tokens.updateMany({
      where: {
        user_id: userId,
        used_at: null,
      },
      data: {
        used_at: new Date(),
      },
    });

    const permissions = await resolveUserPermissions(prisma, userId);

    const userWithRoles = await prisma.users.findUnique({
      where: { id: userId },
      include: { user_roles: { include: { role: true } } },
    });

    const roles = Serializer.serializeRoles(userWithRoles);

    const freshJwt = AuthService.signJwt({
      sub: userPayload.sub,
      email: userPayload.email,
      roles: roles.map((r:any) => r.name),
      permissions,
      isSuperAdmin: userPayload.isSuperAdmin,
    });


    CookieManager.setAuthToken(reply, freshJwt);

    logger.audit({
      user_id: userPayload.sub,
      action: 'CHANGE_PASSWORD',
      resource: 'users',
      resource_id: userPayload.sub,
      status: 'success',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
      metadata: { requestId },
    });

    return reply.send({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    logger.error('CHANGE_PASSWORD_ERROR', error as Error, { requestId });
    throw error;
  }
}
