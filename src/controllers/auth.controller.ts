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
const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
 institution_code: z.string().optional(),
});


const InviteSchema = z.object({
  email: z.string().email('Invalid email format'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  institution_id: z.number().int().optional().nullable(),
});

const ConsumeInviteSchema = z.object({
  token: z.string().min(20),
});


const ChangePasswordSchema = z.object({
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_new_password: z.string().min(8, 'Password must be at least 8 characters'),
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

    const { email, password, institution_code } = parsed.data;
    const prisma = request.prisma;

    logger.info('Login attempt', {
      email,
      institution_code: institution_code ?? 'SUPER_ADMIN',
      ip: request.ip,
    });


    if (!institution_code) {
      const user = await prisma.users.findFirst({
        where: {
          email,
          institution_id: null,
          status: 'active',
        },
        include: {
          user_roles: {
            include: { role: true },
          },
        },
      });

      if (!user || !user.password_hash) {
        throw new UnauthorizedError('Invalid credentials');
      }

      const valid = await AuthService.comparePassword(
        password,
        user.password_hash
      );

      if (!valid) {
        throw new UnauthorizedError('Invalid credentials');
      }
      console.log("harish", user.id)
      await prisma.users.update({
  where: { id: user.id },
  data: { last_login_at: new Date() },
});
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


    const institution = await prisma.institutions.findUnique({
      where: { code: institution_code },
    });

    if (!institution) {
      throw new UnauthorizedError('Invalid institution code');
    }

    const user = await prisma.users.findUnique({
      where: {
        email_institution_id: {
          email,
          institution_id: institution.id,
        },
      },
      include: {
        user_roles: {
          include: { role: true },
        },
      },
    });

    if (!user || !user.password_hash) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const valid = await AuthService.comparePassword(
      password,
      user.password_hash
    );

    if (!valid) {
      throw new UnauthorizedError('Invalid credentials');
    }
await prisma.users.update({
  where: { id: user.id },
  data: { last_login_at: new Date() },
});
    if (user.status !== 'active') {
      throw new ForbiddenError('User account is not active');
    }

    const userId = Serializer.bigIntToString(user.id);
    const roles = Serializer.serializeRoles(user);
    const permissions = await resolveUserPermissions(prisma, user.id);

    const token = AuthService.signJwt({
      sub: userId,
      email: user.email,
      institution_id: institution.id,
      roles: roles.map((r: any) => r.name),
      permissions,
    });

    CookieManager.setAuthToken(reply, token);

    return reply.send(
      Serializer.authResponse(true, {
        id: userId,
        email: user.email,
        institution_id: institution.id,
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
        user_id: payload.sub,
        action: 'LOGOUT',
        resource: 'auth',
        status: 'success',
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
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

    const { email, first_name, last_name, institution_id } = parsed.data;
    const prisma = request.prisma;
    const emailService = new EmailService(request.server.mailer);
    const currentUser = (request as any).user;

    if (!institution_id) {
      throw new ValidationError('institutionId is required for invite');
    }

    logger.info('Generating invite', {
      email,
      institution_id,
      invited_by: currentUser?.sub,
    });


    let user = await prisma.users.findFirst({
      where: { email, institution_id },
    });

    const userWasExisting = !!user;

    if (!user) {
      user = await prisma.users.create({
        data: {
          email,
          first_name: first_name ?? null,
          last_name: last_name ?? null,
          institution_id,
          status: 'active',
          must_change_password: true,
          password_hash: null,
        },
      });
    }


    if (!userWasExisting) {
      const institutionAdminRole = await prisma.roles.findFirst({
        where: {
          institution_id,
          is_system_role: false,
          parent_id: null,
        },
      });

      if (!institutionAdminRole) {
        throw new Error('Institution admin role not configured');
      }

      await prisma.user_roles.create({
        data: {
          user_id: user.id,
          role_id: institutionAdminRole.id,
          assigned_by: BigInt(currentUser?.sub),
        },
      });
    }


    const { token: rawToken, hash: tokenHash } = AuthService.generateToken();
    const expiresAt = new Date(
      Date.now() + config.auth.otpExpiryMinutes * 60 * 1000
    );

    await prisma.auth_tokens.create({
      data: {
        user_id: user.id,
        token_hash:tokenHash,
        type: token_type.email_verification,
        expires_at:expiresAt,
      },
    });

    const link = `${config.auth.oneTimeLinkBase}?token=${rawToken}`;

    await emailService.sendInvite(email, link, 'institution', {
      recipientName: `${first_name ?? ''} ${last_name ?? ''}`.trim()
    });

    logger.audit({
      user_id: currentUser?.sub,
      action: 'GENERATE_INVITE',
      resource: 'users',
      resource_id: Serializer.bigIntToString(user.id),
      status: 'success',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
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

  const tokenRec = await prisma.auth_tokens.findFirst({
    where: {
      token_hash:tokenHash,
      type: token_type.email_verification,
      used_at: null,
      expires_at: { gt: new Date() },
    },
    include: {
      user: {
        include: {
          user_roles: { include: { role: true } },
        },
      },
    },
  });

  if (!tokenRec || !tokenRec.user) {
    throw new UnauthorizedError('Invalid or expired invitation link');
  }

  // mark token as used
await prisma.auth_tokens.updateMany({
  where: {
    user_id: tokenRec.userId,
    used_at: null,
  },
  data: { used_at: new Date() },
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

  if (user.must_change_password) {
    jwtPayload.temp = true;
    jwtPayload.must_change_password = true;
  }

  const jwt = AuthService.signJwt(jwtPayload);

  return reply.send({
    token: jwt,
    must_change_password: user.must_change_password,
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

    const { new_password, confirm_new_password } = parsed.data;
    const payload = (request as any).user;

    if (!payload) {
      throw new UnauthorizedError();
    }

    if (new_password !== confirm_new_password) {
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

    const userWithRoles = await prisma.users.findUnique({
      where: { id: userId },
      include: {
        user_roles: { include: { role: true } },
      },
    });

    if (!userWithRoles) {
      throw new NotFoundError('User not found');
    }

    const roles = Serializer.serializeRoles(userWithRoles);

    //  Hash password
    const passwordHash = await AuthService.hashPassword(new_password);

    //  Update user
    await prisma.users.update({
      where: { id: userId },
      data: {
        password_hash:passwordHash,
        must_change_password: false,
        status: 'active',
      },
    });

    //  Invalidate all tokens
    await prisma.auth_tokens.updateMany({
      where: { user_id:userId, used_at: null },
      data: { used_at: new Date() },
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
      user_id: payload.sub,
      action: 'CHANGE_PASSWORD',
      resource: 'users',
      resource_id: payload.sub,
      status: 'success',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
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


