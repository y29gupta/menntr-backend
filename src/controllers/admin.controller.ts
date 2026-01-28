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
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

export async function createSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const logger = new Logger(request.log);

  try {
    logger.info('Creating super admin', {
      ip: request.ip,
      user_agent: request.headers['user-agent'],
    });


    if (!config.auth.allowSuperAdminCreation) {
      logger.warn('Super admin creation blocked by config', {
        env: config.nodeEnv,
      });
      throw new ForbiddenError(
        'Super admin creation is disabled in this environment'
      );
    }


    const parsed = CreateSuperAdminSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid request payload',
        parsed.error.issues
      );
    }

    const { email, password, first_name, last_name } = parsed.data;
    const prisma = request.prisma;


    const existing = await prisma.users.findFirst({ where: { email } });
    if (existing) {
      throw new ConflictError(
        'An account with this email already exists'
      );
    }


    const passwordHash = await AuthService.hashPassword(password);

    const created = await prisma.users.create({
      data: {
        email,
        password_hash:passwordHash,
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        status: 'active',
        must_change_password: false,
      },
    });


    const superRole = await prisma.roles.findFirst({
      where: {
        name: 'Super Admin',
        is_system_role: true,
      },
    });

    if (!superRole) {
      logger.error('Super Admin role missing in database');
      throw new InternalServerError(
        'System misconfiguration: Super Admin role not found'
      );
    }

    await prisma.user_roles.create({
      data: {
        user_id: created.id,
        role_id: superRole.id,
        assigned_by: created.id,
      },
    });


    const userWithRoles = await prisma.users.findUnique({
      where: { id: created.id },
      include: {
        user_roles: {
          include: { role: true },
        },
      },
    });

    const roles = Serializer.serializeRoles(userWithRoles);


    const payload = {
      sub: Serializer.bigIntToString(created.id),
      email: created.email,
      roles: roles.map((r: any) => r.name),
    };

    const jwtToken = AuthService.signJwt(payload);

    logger.audit({
      user_id: payload.sub,
      action: 'CREATE_SUPER_ADMIN',
      resource: 'users',
      resource_id: payload.sub,
      status: 'success',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
    });

    return reply.code(201).send({
      token: jwtToken,
      user: Serializer.user(created),
    });
  } catch (error: any) {

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


    if (
      error instanceof ValidationError ||
      error instanceof ConflictError ||
      error instanceof ForbiddenError
    ) {
      throw error;
    }


    logger.error('Unexpected error in createSuperAdmin', error, {
      ip: request.ip,
    });

    throw new InternalServerError(
      'Something went wrong while creating super admin'
    );
  }
}
