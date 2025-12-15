import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth';
import { Serializer } from '../utils/serializers';
import { Logger } from '../utils/logger';
import { ForbiddenError, ConflictError, ValidationError } from '../utils/errors';
import { config } from '../config';

const CreateSuperAdminSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export async function createSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);

  try {
    logger.info('Creating super admin', {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    if (!config.auth.allowSuperAdminCreation) {
      logger.warn('Super admin creation attempt blocked', { env: config.nodeEnv });
      throw new ForbiddenError('Super admin creation is not allowed in this environment');
    }

    const parsed = CreateSuperAdminSchema.safeParse(request.body);
    if (!parsed.success) {
      // FIXED: Use 'issues' instead of 'errors'
      throw new ValidationError('Invalid request', parsed.error.issues);
    }

    const { email, password, firstName, lastName } = parsed.data;
    const prisma = request.prisma;

    const existing = await prisma.users.findFirst({ where: { email } });
    if (existing) {
      logger.warn('Super admin creation failed - user exists', { email });
      throw new ConflictError('User already exists');
    }

    const passwordHash = await AuthService.hashPassword(password);

    const created = await prisma.users.create({
      data: {
        email,
        password_hash: passwordHash,
        first_name: firstName ?? null,
        last_name: lastName ?? null,
        status: 'active',
        must_change_password: false,
      },
    });

    // Assign super admin role
    try {
      const superRole = await prisma.roles.findFirst({
        where: { is_system_role: true, name: 'Super Admin' },
      });

      if (superRole) {
        await prisma.user_roles.create({
          data: {
            user_id: created.id,
            role_id: superRole.id,
            assigned_by: created.id,
          },
        });
      }
    } catch (err) {
      logger.warn('Failed to auto-assign super role', { error: err });
    }

    const payload = {
      sub: Serializer.bigIntToString(created.id),
      email: created.email,
      roles: ['superadmin'],
    };
    const jwtToken = AuthService.signJwt(payload); // FIXED: Renamed to avoid conflict

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
      token: jwtToken, // FIXED: Use renamed variable
      user: Serializer.user(created),
    });
  } catch (error) {
    logger.error('createSuperAdmin failed', error as Error, {
      ip: request.ip,
    });
    throw error;
  }
}
