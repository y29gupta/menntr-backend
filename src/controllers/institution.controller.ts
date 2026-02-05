import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ValidationError, ConflictError, ForbiddenError, UnauthorizedError } from '../utils/errors';
import { Logger } from '../utils/logger';
import { AuthService } from '../services/auth';
import { Serializer } from '../utils/serializers';
import { CookieManager } from '../utils/cookie';
import { provisionInstitution } from '../services/institution.service';

export const CreateInstitutionBody = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  subdomain: z.string().optional().nullable(),
  contact_email: z.string().email(),
  plan_id: z.number().int().optional().nullable(),
});

const CreateInstitutionAdmin = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  first_name: z.string().min(6).optional(),
  last_name: z.string().min(1).optional(),
  institution_id: z.number().int(),
});
const GetPlanModulesParamsSchema = z.object({
  planId: z.coerce.number(),
});

const UpdateInstitutionPutBody = CreateInstitutionBody;

const InstitutionIdParamsSchema = z.object({
  id: z.coerce.number(),
});
export function serializeInstitution(inst: any) {
  // convert bigint id if present
  return {
    id: typeof inst.id === 'bigint' ? inst.id.toString() : inst.id,
    name: inst.name,
    code: inst.code,
    subdomain: inst.subdomain,
    contact_email: inst.contact_email,
    plan_id:
      inst.plan_id == null
        ? null
        : typeof inst.plan_id === 'bigint'
          ? inst.plan_id.toString()
          : inst.plan_id,
    status: inst.status,
    created_at: inst.created_at ?? null,
    updated_at: inst.updated_at ?? null,
  };
}

export async function createInstitutionHandler(request: FastifyRequest, reply: FastifyReply) {
  const logger = new Logger(request.log);
  try {
    const parsed = CreateInstitutionBody.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request', parsed.error.issues);

    const { name, code, subdomain, contact_email, plan_id } = parsed.data;
    const prisma = request.prisma;
    // const existing = await prisma.institution.findFirst({
    //   where: {
    //     OR: [{ code }, { subdomain: subdomain ?? undefined }],
    //   },
    // });

    // if (existing) {
    //   if (existing.code === code) {
    //     throw new ConflictError('Institution with this code already exists');
    //   }
    //   if (existing.subdomain === subdomain) {
    //     throw new ConflictError('Institution with this subdomain already exists');
    //   }
    // }
    const inst = await prisma.institutions.create({
      data: {
        name,
        code,
        // subdomain,
        contact_email,
        plan_id: plan_id ?? null,
        status: 'active',
      },
    });
    await provisionInstitution(prisma, inst.id, inst.plan_id);

    logger.audit({
      user_id: (request as any).user?.sub,
      action: 'CREATE_INSTITUTION',
      resource: 'institutions',
      resource_id: inst.id.toString(),
      status: 'success',
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
    });

    return reply.code(201).send(serializeInstitution(inst));
  } catch (error: any) {
    logger.error('createInstitution failed', error as Error);
    throw error;
  }
}

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

    const { email, password, first_name, last_name, institution_id } = parsed.data;
    const prisma = request.prisma;

    // Create user
    // const passwordHash = await AuthService.hashPassword(password);
    const user = await prisma.users.create({
      data: {
        email,
        // passwordHash,
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        institution_id: institution_id,
        status: 'active',
        must_change_password: true,
      },
    });

    // Find "Institution Admin" role for this institution (should exist from default roles)
    const institutionAdminRole = await prisma.roles.findFirst({
      where: {
        name: 'Institution Admin',
        institution_id: institution_id,
        is_system_role: false,
        role_hierarchy_id: 1,
      },
    });

    if (!institutionAdminRole) {
      throw new Error('Institution Admin role not found. Default roles may not have been created.');
    }

    // Assign role to user
    await prisma.user_roles.create({
      data: {
        user_id: user.id,
        role_id: institutionAdminRole.id,
        assigned_by: BigInt(currentUser.sub),
      },
    });

    logger.audit({
      user_id: currentUser.sub,
      action: 'CREATE_INSTITUTION_ADMIN',
      resource: 'users',
      resource_id: user.id.toString(),
      status: 'success',
      metadata: { institution_id },
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
    //  Validate URL params
    const paramsParsed = InstitutionIdParamsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({
        error: 'Invalid institution id',
        details: paramsParsed.error,
      });
    }

    //  Validate body
    const bodyParsed = UpdateInstitutionPutBody.safeParse(request.body);
    if (!bodyParsed.success) {
      return reply.code(400).send({
        error: 'Invalid request body',
        details: bodyParsed.error,
      });
    }

    const { id } = paramsParsed.data;
    const prisma = request.prisma;

    //  Check if institution exists
    const existingInstitution = await prisma.institutions.findUnique({
      where: { id },
    });

    if (!existingInstitution) {
      return reply.code(404).send({
        error: 'Institution not found',
      });
    }

    //  Update institution
    const updatedInstitution = await prisma.institutions.update({
      where: { id },
      data: {
        name: bodyParsed.data.name,
        code: bodyParsed.data.code,
        subdomain: bodyParsed.data.subdomain ?? null,
        contact_email: bodyParsed.data.contact_email,
        plan_id: bodyParsed.data.plan_id ?? null,
      },
    });

    return reply.code(200).send(updatedInstitution);
  } catch (err: any) {
    request.server.log.error({ err }, 'updateInstitutionPutHandler failed');

    //  Handle unique constraint violation
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

interface InstitutionQuery {
  page?: string;
  limit?: string;
  search?: string;

  name?: string;
  code?: string;
  contactEmail?: string;
  status?: string;
  planCode?: string;
}

export async function getInstitutionsHandler(
  request: FastifyRequest<{ Querystring: InstitutionQuery }>,
  reply: FastifyReply
) {
  try {
    const prisma = request.server.prisma;

    const {
      page = '1',
      limit = '10',
      search,
      name,
      code,
      contactEmail,
      status,
      planCode,
    } = request.query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (
      Number.isNaN(pageNumber) ||
      Number.isNaN(limitNumber) ||
      pageNumber < 1 ||
      limitNumber < 1
    ) {
      return reply.code(400).send({
        error: 'Invalid pagination parameters',
      });
    }

    /* ----------------------------------
       Filters (UNCHANGED)
    ---------------------------------- */
    const where: any = {};

    if (name) {
      where.name = { contains: name, mode: 'insensitive' };
    }

    if (code) {
      where.code = { contains: code, mode: 'insensitive' };
    }

    if (contactEmail) {
      where.contact_email = { contains: contactEmail, mode: 'insensitive' };
    }

    if (status) {
      where.status = status;
    }

    if (planCode) {
      where.plan = {
        code: {
          contains: planCode,
          mode: 'insensitive',
        },
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { contact_email: { contains: search, mode: 'insensitive' } },
      ];
    }

    /* ----------------------------------
       1️⃣ Fetch institutions (NO count here)
    ---------------------------------- */
    const [institutions, meta] = await prisma.institutions
      .paginate({
        where,
        select: {
          id: true,
          name: true,
          code: true,
          contact_email: true,
          status: true,
          created_at: true,
          plan: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      })
      .withPages({
        page: pageNumber,
        limit: limitNumber,
      });

    /* ----------------------------------
       2️⃣ Get CORRECT student counts
       (DISTINCT users per institution)
    ---------------------------------- */
    const studentCounts = await prisma.users.groupBy({
      by: ['institution_id'],
      where: {
        institution_id: {
          in: institutions.map((i:any) => i.id),
        },
        user_roles: {
          some: {
            role: {
              name: 'Student', // ✅ lowercase (case-sensitive)
            },
          },
        },
      },
      _count: {
        id: true, // ✅ DISTINCT users.id
      },
    });

    /* ----------------------------------
       3️⃣ Map counts by institution_id
    ---------------------------------- */
    const countMap = new Map<number, number>();
    for (const row of studentCounts) {
      if (row.institution_id !== null) {
        countMap.set(row.institution_id, row._count.id);
      }
    }

    /* ----------------------------------
       4️⃣ Final response
    ---------------------------------- */
    return reply.send({
      data: institutions.map((institution:any) => ({
        id: institution.id,
        name: institution.name,
        code: institution.code,
        contact_email: institution.contact_email,
        status: institution.status,
        created_at: institution.created_at,
        plan: institution.plan,
        studentCount: countMap.get(institution.id) ?? 0, // ✅ EXACT COUNT
      })),
      meta: {
        ...meta,
        currentPageCount: institutions.length,
      },
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({
      error: 'Internal server error',
    });
  }
}

export async function getPlanModulesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parsed = GetPlanModulesParamsSchema.safeParse(request.params);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid plan id',
        details: parsed.error,
      });
    }

    const { planId } = parsed.data;
    const prisma = (request as any).prisma;

    const planModules = await prisma.plan_modules.findMany({
      where: {
        plan_id: planId,
        included: true,
      },
      orderBy: {
        module: {
          sort_order: 'asc',
        },
      },
      select: {
        plan: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        module: {
          select: {
            id: true,
            code: true,
            name: true,
            category: true,
          },
        },
      },
    });

    if (planModules.length === 0) {
      return reply.code(404).send({
        error: 'No modules found for this plan',
      });
    }

    return reply.code(200).send({
      planId: planModules[0].plan.id,
      planCode: planModules[0].plan.code,
      planName: planModules[0].plan.name,
      modules: planModules.map((pm: any) => ({
        id: pm.module.id,
        code: pm.module.code,
        name: pm.module.name,
        category: pm.module.category,
      })),
    });
  } catch (err) {
    request.server.log.error({ err }, 'getInstitutionsHandler failed');
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

// interface InstitutionQuery {
//   page?: number;
//   limit?: number;
//   status?: string;
//   planId?: number;
//   search?: string;
// }

// export async function getInstitutionsHandler(
//   request: FastifyRequest<{ Querystring: InstitutionQuery }>,
//   reply: FastifyReply
// ) {
//   try {
//     const prisma = request.server.prisma;

//     const { page = 1, limit = 10, status, planId, search } = request.query;

//     const where: any = {};

//     // Column filters
//     if (status) where.status = status;
//     if (planId) where.planId = planId;

//     // Global search
//     if (search) {
//       where.OR = [
//         { name: { contains: search, mode: 'insensitive' } },
//         { code: { contains: search, mode: 'insensitive' } },
//         { contactEmail: { contains: search, mode: 'insensitive' } },
//       ];
//     }

//     const [data, meta] = await prisma.institution
//       .paginate({
//         where,
//         select: {
//           id: true,
//           name: true,
//           code: true,
//           contactEmail: true,
//           status: true,
//           planId: true,
//           createdAt: true,
//           plan: {
//             select: { id: true, name: true, code: true },
//           },
//         },
//         orderBy: { createdAt: 'desc' },
//       })
//       .withPages({ page, limit });

//     return reply.send({ data, meta });
//   } catch (err) {
//     request.log.error(err);
//     return reply.code(500).send({ error: 'Internal server error' });
//   }
// }

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
