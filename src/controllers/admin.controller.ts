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

const CreateSuperAdminSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export async function createSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const logger = new Logger(request.log);

  try {
    logger.info('Creating super admin', {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    /* ─────────────────────────────
       ENVIRONMENT GUARD
    ───────────────────────────── */
    if (!config.auth.allowSuperAdminCreation) {
      logger.warn('Super admin creation blocked by config', {
        env: config.nodeEnv,
      });
      throw new ForbiddenError(
        'Super admin creation is disabled in this environment'
      );
    }

    /* ─────────────────────────────
       VALIDATION
    ───────────────────────────── */
    const parsed = CreateSuperAdminSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid request payload',
        parsed.error.issues
      );
    }

    const { email, password, firstName, lastName } = parsed.data;
    const prisma = request.prisma;

    /* ─────────────────────────────
       DUPLICATE CHECK
    ───────────────────────────── */
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
      throw new ConflictError(
        'An account with this email already exists'
      );
    }

    /* ─────────────────────────────
       CREATE USER
    ───────────────────────────── */
    const passwordHash = await AuthService.hashPassword(password);

    const created = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        status: 'active',
        mustChangePassword: false,
      },
    });

    /* ─────────────────────────────
       ASSIGN SUPER ADMIN ROLE
    ───────────────────────────── */
    const superRole = await prisma.role.findFirst({
      where: {
        name: 'Super Admin',
        isSystemRole: true,
      },
    });

    if (!superRole) {
      logger.error('Super Admin role missing in database');
      throw new InternalServerError(
        'System misconfiguration: Super Admin role not found'
      );
    }

    await prisma.userRole.create({
      data: {
        userId: created.id,
        roleId: superRole.id,
        assignedBy: created.id,
      },
    });

    /* ─────────────────────────────
       LOAD USER WITH ROLES
    ───────────────────────────── */
    const userWithRoles = await prisma.user.findUnique({
      where: { id: created.id },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    const roles = Serializer.serializeRoles(userWithRoles);

    /* ─────────────────────────────
       JWT
    ───────────────────────────── */
    const payload = {
      sub: Serializer.bigIntToString(created.id),
      email: created.email,
      roles: roles.map((r: any) => r.name),
    };

    const jwtToken = AuthService.signJwt(payload);

    logger.audit({
      userId: payload.sub,
      action: 'CREATE_SUPER_ADMIN',
      resource: 'users',
      resourceId: payload.sub,
      status: 'success',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.code(201).send({
      token: jwtToken,
      user: Serializer.user(created),
    });
  } catch (error: any) {
    /* ─────────────────────────────
       PRISMA ERROR MAPPING
    ───────────────────────────── */
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error('Prisma error during super admin creation', error);

      if (error.code === 'P2002') {
        throw new ConflictError(
          'An account with this email already exists'
        );
      }

      throw new InternalServerError(
        'Database operation failed while creating super admin'
      );
    }

    /* ─────────────────────────────
       ZOD / CUSTOM ERRORS
    ───────────────────────────── */
    if (
      error instanceof ValidationError ||
      error instanceof ConflictError ||
      error instanceof ForbiddenError
    ) {
      throw error;
    }

    /* ─────────────────────────────
       FALLBACK
    ───────────────────────────── */
    logger.error('Unexpected error in createSuperAdmin', error, {
      ip: request.ip,
    });

    throw new InternalServerError(
      'Something went wrong while creating super admin'
    );
  }
}
