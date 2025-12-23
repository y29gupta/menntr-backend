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
  password: z.string().min(8).optional(),
  firstName: z.string().min(6).optional(),
  lastName: z.string().min(1).optional(),
  institutionId: z.number().int(),
});
const GetPlanModulesParamsSchema = z.object({
  planId: z.coerce.number(),
});

const UpdateInstitutionPutBody = CreateInstitutionBody;

const InstitutionIdParamsSchema = z.object({
  id: z.coerce.number(),
});
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
    if (!parsed.success) throw new ValidationError('Invalid request', parsed.error.issues);

    const { name, code, subdomain, contactEmail, planId } = parsed.data;
    const prisma = request.prisma;
    const existing = await prisma.institution.findFirst({
      where: {
        OR: [{ code }, { subdomain: subdomain ?? undefined }],
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
    logger.error('createInstitution failed', error as Error);
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

export async function updateInstitutionPutHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    // ✅ Validate URL params
    const paramsParsed = InstitutionIdParamsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({
        error: 'Invalid institution id',
        details: paramsParsed.error,
      });
    }

    // ✅ Validate body (FULL replacement)
    const bodyParsed = UpdateInstitutionPutBody.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.code(400).send({
        error: 'Invalid request body',
        details: bodyParsed.error,
      });
    }

    const { id } = paramsParsed.data;
    const prisma = request.prisma;

    // ✅ Check if institution exists
    const existingInstitution = await prisma.institution.findUnique({
      where: { id },
    });

    if (!existingInstitution) {
      return reply.code(404).send({
        error: 'Institution not found',
      });
    }

    // ✅ PUT = full replacement update
    const updatedInstitution = await prisma.institution.update({
      where: { id },
      data: {
        name: bodyParsed.data.name,
        code: bodyParsed.data.code,
        subdomain: bodyParsed.data.subdomain ?? null,
        contactEmail: bodyParsed.data.contactEmail,
        planId: bodyParsed.data.planId ?? null,
      },
    });

    return reply.code(200).send(updatedInstitution);
  } catch (err: any) {
    request.server.log.error({ err }, 'updateInstitutionPutHandler failed');

    // ✅ Handle unique constraint violation
    if (err?.code === 'P2002') {
      return reply.code(409).send({
        error: 'Duplicate value violates unique constraint',
        fields: err.meta?.target,
      });
    }

    return reply.code(500).send({
      error: 'Internal server error',
    });
  }
}

export async function getInstitutionsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = (request as any).prisma;

    const institutions = await prisma.institution.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        contactEmail: true,
        status: true,
        planId: true,
        createdAt: true,
        plan: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return reply.code(200).send({
      count: institutions.length,
      data: institutions,
    });
  } catch (err) {
    request.server.log.error({ err }, 'getInstitutionsHandler failed');
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

// export async function getPlanModulesHandler(request: FastifyRequest, reply: FastifyReply) {
//   try {
//     const parsed = GetPlanModulesParamsSchema.safeParse(request.params);

//     if (!parsed.success) {
//       return reply.code(400).send({
//         error: 'Invalid plan id',
//         details: parsed.error,
//       });
//     }

//     const { planId } = parsed.data;
//     const prisma = (request as any).prisma;

//     const planModules: Prisma.plan_modulesGetPayload<{
//       select: {
//         plans: {
//           select: { id: true; code: true; name: true };
//         };
//         modules: {
//           select: { id: true; code: true; name: true; category: true };
//         };
//       };
//     }>[] = await prisma.plan_modules.findMany({
//       where: {
//         plan_id: planId,
//         included: true,
//       },
//       orderBy: {
//         modules: { sort_order: 'asc' },
//       },
//       select: {
//         plans: { select: { id: true, code: true, name: true } },
//         modules: { select: { id: true, code: true, name: true, category: true } },
//       },
//     });

//     if (planModules.length === 0) {
//       return reply.code(404).send({ error: 'No modules found for this plan' });
//     }

//     return reply.code(200).send({
//       planId: planModules[0].plans.id,
//       planCode: planModules[0].plans.code,
//       planName: planModules[0].plans.name,
//       modules: planModules.map((pm) => ({
//         id: pm.modules.id,
//         code: pm.modules.code,
//         name: pm.modules.name,
//         category: pm.modules.category,
//       })),
//     });
//   } catch (err) {
//     request.server.log.error({ err }, 'getPlanModulesHandler failed');
//     return reply.code(500).send({ error: 'Internal server error' });
//   }
// }
