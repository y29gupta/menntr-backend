// src/controllers/institution.controller.ts
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ValidationError, ConflictError, ForbiddenError, UnauthorizedError } from '../utils/errors';
import { Logger } from '../utils/logger';
import { AuthService } from '../services/auth';
import { Serializer } from '../utils/serializers';
import { CookieManager } from '../utils/cookie';

const CreateInstitutionBody = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  subdomain: z.string().optional().nullable(),
  contactEmail: z.string().email(),
  planId: z.number().int().optional().nullable(),
});

const CreateInstitutionAdmin = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(6),
  lastName: z.string().min(1),
  institutionId: z.number().int(),
})

function serializeInstitution(inst: any) {
  // convert bigint id if present
  return {
    id: typeof inst.id === 'bigint' ? inst.id.toString() : inst.id,
    name: inst.name,
    code: inst.code,
    subdomain: inst.subdomain,
    contactEmail: inst.contactEmail,
    planId:
      inst.planId == null
        ? null
        : typeof inst.planId === 'bigint'
          ? inst.planId.toString()
          : inst.planId,
    status: inst.status,
    createdAt: inst.createdAt ?? null,
    updatedAt: inst.updatedAt ?? null,
  };
}

export async function createInstitutionHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);
  try {
    const parsed = CreateInstitutionBody.safeParse(request.body);
    if (!parsed.success)
      throw new ValidationError('Invalid request', parsed.error.issues);

    const { name, code, subdomain, contactEmail, planId } = parsed.data;
    const prisma = request.prisma;
    const existing = await prisma.institution.findFirst({
      where: {
        OR: [
          { code },
          { subdomain: subdomain ?? undefined },
        ],
      },
    });

    if (existing) {
      if (existing.code === code) {
        throw new ConflictError('Institution with this code already exists');
      }
      if (existing.subdomain === subdomain) {
        throw new ConflictError('Institution with this subdomain already exists');
      }
    }
    const inst = await prisma.institution.create({
      data: {
        name,
        code,
        subdomain,
        contactEmail,
        planId: planId ?? null,
        status: 'active',
      },
    });

    logger.audit({
      userId: (request as any).user?.sub,
      action: 'CREATE_INSTITUTION',
      resource: 'institutions',
      resourceId: inst.id.toString(),
      status: 'success',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.code(201).send(serializeInstitution(inst));
  } catch (error: any) {
    logger.error('createInstitution failed', error as Error)
    throw error;
  }
}

// After creating institution
export async function createInstitutionAdminHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);

  try {
    const currentUser = request.user;

    if (!currentUser) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!currentUser.roles?.includes('Super Admin')) {
      throw new ForbiddenError('Only Super Admin can create Institution Admins');
    }
    const parsed = CreateInstitutionAdmin.safeParse(request.body);

    if (!parsed.success) throw new ValidationError('Invalid request', parsed.error.issues);

    const { email, password, firstName, lastName, institutionId } = parsed.data;
    const prisma = request.prisma;

    // Create user
    const passwordHash = await AuthService.hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        institutionId: institutionId,
        status: 'active',
        mustChangePassword: true,
      },
    });

    // Find or create "Institution Admin" role for this institution
    let institutionAdminRole = await prisma.role.findFirst({
      where: {
        name: 'Institution Admin',
        institutionId: institutionId,
        isSystemRole: false,
      },
    });

    if (!institutionAdminRole) {
      // Create role if it doesn't exist
      institutionAdminRole = await prisma.role.create({
        data: {
          name: 'Institution Admin',
          institutionId: institutionId,
          isSystemRole: false,
        },
      });
    }

    // Assign role to user
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: institutionAdminRole.id,
        assignedBy: BigInt(currentUser.sub),
      },
    });

    logger.audit({
      userId: currentUser.sub,
      action: 'CREATE_INSTITUTION_ADMIN',
      resource: 'users',
      resourceId: user.id.toString(),
      status: 'success',
      metadata: { institutionId },
    });

    return reply.code(201).send({
      message: 'Institution Admin created successfully',
      user: Serializer.user(user),
    });
  } catch (error) {
    logger.error('createInstitutionAdmin failed', error as Error);
    throw error;
  }
}