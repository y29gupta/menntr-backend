import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { AuthService } from '../services/auth';
import { Serializer } from '../utils/serializers';
import { Logger } from '../utils/logger';
import {
  ForbiddenError,
  ConflictError,
  ValidationError,
  InternalServerError,
} from '../utils/errors';
import { config } from '../config';

/* -------------------------------------------------------------------------- */
/*                                VALIDATION                                  */
/* -------------------------------------------------------------------------- */

// Email: required, normalized, bounded, safe
export const SecureEmail = z
  .string()
  .trim()
  .min(1, { message: 'Email is required' }) // required check
  .max(254, { message: 'Email is too long' })
  .email({ message: 'Invalid email format' })
  .transform((val) => val.toLowerCase());

// Password: strong, bounded, DoS-safe
export const SecurePassword = z
  .string()
  .min(12, { message: 'Password must be at least 12 characters' })
  .max(128, { message: 'Password is too long' })
  .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
  .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
  .regex(/[0-9]/, { message: 'Password must contain at least one number' })
  .regex(/[^A-Za-z0-9]/, {
    message: 'Password must contain at least one special character',
  });

// Optional names (bounded + safe)
export const OptionalName = z
  .string()
  .trim()
  .min(1, { message: 'Name cannot be empty' })
  .max(100, { message: 'Name is too long' })
  .optional();

/* -------------------------------------------------------------------------- */
/*                       CREATE SUPER ADMIN SCHEMA                             */
/* -------------------------------------------------------------------------- */

export const CreateSuperAdminSchema = z
  .object({
    email: SecureEmail,
    password: SecurePassword,
    first_name: OptionalName,
    last_name: OptionalName,
  })
  .strict(); // 🚨 blocks unknown fields


/* -------------------------------------------------------------------------- */
/*                               CONTROLLER                                   */
/* -------------------------------------------------------------------------- */

export async function createSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);
  const requestId = request.id;

  logger.info('CREATE_SUPER_ADMIN_REQUEST_RECEIVED', {
    requestId,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  });

  try {
    /* ---------------------------------------------------------------------- */
    /*                           ENVIRONMENT GUARD                             */
    /* ---------------------------------------------------------------------- */

    if (!config.auth.allowSuperAdminCreation) {
      logger.warn('SUPER_ADMIN_CREATION_DISABLED', {
        requestId,
        env: config.nodeEnv,
      });

      throw new ForbiddenError('Super admin creation is disabled in this environment');
    }

    /* ---------------------------------------------------------------------- */
    /*                               VALIDATION                                */
    /* ---------------------------------------------------------------------- */

    const parsed = CreateSuperAdminSchema.safeParse(request.body);
    if (!parsed.success) {
      logger.warn('CREATE_SUPER_ADMIN_VALIDATION_FAILED', {
        requestId,
        issues: parsed.error.issues,
      });

      throw new ValidationError('Invalid request payload', parsed.error.issues);
    }

    const { email, password, first_name, last_name } = parsed.data;
    const prisma = request.prisma;

    /* ---------------------------------------------------------------------- */
    /*                         DATABASE TRANSACTION                            */
    /* ---------------------------------------------------------------------- */

    const createdUser = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Check existing user
      const existing = await tx.users.findFirst({
        where: { email },
      });

      if (existing) {
        throw new ConflictError('An account with this email already exists');
      }

      // Fetch Super Admin role
      const superRole = await tx.roles.findFirst({
        where: {
          name: 'Super Admin',
          is_system_role: true,
        },
      });

      if (!superRole) {
        logger.error('SUPER_ADMIN_ROLE_NOT_FOUND', undefined, { requestId });

        throw new InternalServerError('System misconfiguration detected');
      }

      // Hash password
      const passwordHash = await AuthService.hashPassword(password);

      // Create user
      const user = await tx.users.create({
        data: {
          email,
          password_hash: passwordHash,
          first_name: first_name ?? null,
          last_name: last_name ?? null,
          status: 'active',
          must_change_password: false,
        },
      });

      // Assign role
      await tx.user_roles.create({
        data: {
          user_id: user.id,
          role_id: superRole.id,
          assigned_by: user.id,
        },
      });

      return user;
    });

    /* ---------------------------------------------------------------------- */
    /*                          TOKEN GENERATION                               */
    /* ---------------------------------------------------------------------- */

    const payload = {
      sub: Serializer.bigIntToString(createdUser.id),
      email: createdUser.email,
      roles: ['Super Admin'],
    };

    const token = AuthService.signJwt(payload);

    /* ---------------------------------------------------------------------- */
    /*                               AUDIT LOG                                 */
    /* ---------------------------------------------------------------------- */

    logger.audit({
      user_id: payload.sub,
      action: 'CREATE_SUPER_ADMIN',
      resource: 'users',
      resource_id: payload.sub,
      status: 'success',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
      metadata: {
        requestId,
      },
    });

    logger.info('CREATE_SUPER_ADMIN_SUCCESS', {
      requestId,
      userId: payload.sub,
    });

    return reply.code(201).send({
      token,
      user: Serializer.user(createdUser),
    });
  } catch (error: any) {
    /* ---------------------------------------------------------------------- */
    /*                           PRISMA ERRORS                                 */
    /* ---------------------------------------------------------------------- */

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error('PRISMA_ERROR_DURING_SUPER_ADMIN_CREATION', error, {
        requestId,
        prismaCode: error.code,
      });

      if (error.code === 'P2002') {
        throw new ConflictError('An account with this email already exists');
      }

      throw new InternalServerError('Database operation failed');
    }

    /* ---------------------------------------------------------------------- */
    /*                          BUSINESS ERRORS                                */
    /* ---------------------------------------------------------------------- */

    if (
      error instanceof ValidationError ||
      error instanceof ConflictError ||
      error instanceof ForbiddenError
    ) {
      logger.warn('CREATE_SUPER_ADMIN_BUSINESS_ERROR', {
        requestId,
        error: error.message,
      });

      throw error;
    }

    /* ---------------------------------------------------------------------- */
    /*                         UNHANDLED / UNKNOWN                             */
    /* ---------------------------------------------------------------------- */

    logger.error('UNHANDLED_CREATE_SUPER_ADMIN_ERROR', error, { requestId });

    throw new InternalServerError('Something went wrong while creating super admin');
  }
}
