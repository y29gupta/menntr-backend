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

    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
      logger.warn('Super admin creation failed - user exists', { email });
      throw new ConflictError('User already exists');
    }

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

    // Assign super admin role
    try {
      const superRole = await prisma.role.findFirst({
        where: { isSystemRole: true, name: 'Super Admin' },
      });

      if (superRole) {
        await prisma.userRole.create({
          data: {
            userId: created.id,
            roleId: superRole.id,
            assignedBy: created.id,
          },
        });
      }
    } catch (err) {
      logger.warn('Failed to auto-assign super role', { error: err });
    }
    const userWithRoles = await prisma.user.findUnique({
      where: { id: created.id },
      include: {
        roles: {
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
