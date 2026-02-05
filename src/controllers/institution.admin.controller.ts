import type { FastifyRequest, FastifyReply } from 'fastify';
import z from 'zod';
import { ForbiddenError } from '../utils/errors';
import { BlobServiceClient } from '@azure/storage-blob';
import { MultipartFile } from '@fastify/multipart';
import XLSX from 'xlsx';
import bcrypt from 'bcrypt';
import { sendInviteInternal } from '../services/invite.service';
import { EmailService } from '../services/email';

const CreateInstitutionMemberSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(1),
  email: z.string().email(),
  phoneNumber: z.string().optional().nullable(),
});

type Params = {
  hierarchyId: string;
};

type ChangeUserStatusBody = {
  status: 'active' | 'suspended';
};

type ChangeUserStatusParams = {
  id: string;
};

export async function getRolesHierarchy(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.server.prisma;

    const roles = await prisma.role_hierarchy.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    //flag we have to add for the student

    return reply.code(200).send({
      data: {
        roles: roles.map((r: any) => ({
          id: r.id,
          name: r.name,
        })),
      },
    });
  } catch (err) {
    request.log.error({ err }, 'getRolesHandler failed');

    return reply.code(500).send({
      error: 'Internal server error',
    });
  }
}

export async function getRolesbasedOnRoleHierarchy(
  request: FastifyRequest<{ Params: Params }>,
  reply: FastifyReply
) {
  try {
    const prisma = request.server.prisma;

    /* --------------------------------------------------
       🔐 Get institutionId from JWT
    -------------------------------------------------- */
    const authUser = request.user as any;
    const institutionId = Number(authUser?.institution_id);

    if (!institutionId) {
      return reply.code(401).send({
        error: 'Invalid or missing authentication token',
      });
    }

    const hierarchyId = Number(request.params.hierarchyId);

    /* --------------------------------------------------
       ✅ Role hierarchy + institution scoped query
    -------------------------------------------------- */
    const rows = await prisma.$queryRaw<{ id: number; role_name: string }[]>`
      SELECT 
        r.id,
        r.name AS role_name
      FROM roles r
      WHERE r.role_hierarchy_id = ${hierarchyId}
        AND r.institution_id = ${institutionId}
      ORDER BY r.name ASC
    `;

    return reply.code(200).send({
      data: {
        roleHierarchyId: hierarchyId,
        roles: rows.map((r: any) => ({
          id: r.id,
          name: r.role_name,
        })),
      },
    });
  } catch (err) {
    request.log.error({ err }, 'getRolesbasedOnRoleHierarchy failed');

    return reply.code(500).send({
      error: 'Internal server error',
    });
  }
}

export async function getModulesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.server.prisma;
    const currentUser = request.user as any;

    if (!currentUser?.institution_id) {
      return reply.code(400).send({
        error: 'Institution ID missing',
      });
    }

    /* --------------------------------------------------
       1️⃣ Get institution plan
    -------------------------------------------------- */
    const institution = await prisma.institutions.findUnique({
      where: {
        id: currentUser.institution_id,
      },
      select: {
        plan_id: true,
        plan: {
          // ✅ ADDED (for parity)
          select: {
            code: true,
          },
        },
      },
    });

    if (!institution?.plan_id) {
      return reply.code(400).send({
        error: 'Institution has no plan',
      });
    }

    /* --------------------------------------------------
       2️⃣ Get plan modules + institution overrides
    -------------------------------------------------- */
    const planModules = await prisma.plan_modules.findMany({
      where: {
        plan_id: institution.plan_id,
        included: true,
        module: {
          institution_modules: {
            none: {
              institution_id: currentUser.institution_id,
              enabled: false,
            },
          },
        },
      },
      select: {
        module: {
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            icon: true,
            category: true,
            is_core: true,
            is_system_module: true,
            sort_order: true,
          },
        },
      },
      orderBy: {
        module: {
          name: 'asc', // ✅ CHANGED (was sort_order)
        },
      },
    });

    /* --------------------------------------------------
       3️⃣ Response (ENRICHED, NOT BROKEN)
    -------------------------------------------------- */
    return reply.send({
      data: planModules.map((pm: any) => ({
        ...pm.module,
        isCore: pm.module.is_core, // ✅ ADDED (team lead parity)
        planCode: institution.plan?.code, // ✅ ADDED (extra context)
      })),
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({
      error: 'Internal server error',
    });
  }
}

export async function getModuleFeaturesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.server.prisma;
    const { moduleId } = request.params as any;

    const currentUser: any = request.user;

    /* --------------------------------------------------
       1️⃣ Get institution plan
    -------------------------------------------------- */
    const institution = await prisma.institutions.findUnique({
      where: { id: Number(currentUser.institution_id) },
      select: {
        plan: {
          select: {
            code: true,
          },
        },
      },
    });

    const planCode = institution?.plan?.code;

    if (!planCode) {
      return reply.send({ data: [] });
    }

    /* --------------------------------------------------
       2️⃣ Get allowed feature codes for plan
    -------------------------------------------------- */
    const planFeatures = await prisma.plan_features.findMany({
      where: {
        plan_code: planCode,
        included: true,
      },
      select: {
        feature_code: true,
      },
    });

    const allowedFeatureCodes = planFeatures.map((p: any) => p.feature_code);

    if (!allowedFeatureCodes.length) {
      return reply.send({ data: [] });
    }

    /* --------------------------------------------------
       3️⃣ Fetch features for module (ADD module relation)
    -------------------------------------------------- */
    const features = await prisma.features.findMany({
      where: {
        module_id: Number(moduleId),
        code: {
          in: allowedFeatureCodes,
        },
      },
      include: {
        module: {
          // ✅ ADDED
          select: {
            code: true,
          },
        },
      },
      orderBy: {
        name: 'asc', // ✅ CHANGED (was sort_order)
      },
    });

    /* --------------------------------------------------
       4️⃣ Map response (ADD moduleCode)
    -------------------------------------------------- */
    const response = features.map((f: any) => ({
      id: f.id,
      code: f.code,
      name: f.name,
      description: f.description,
      moduleId: f.module_id,
      moduleCode: f.module?.code ?? null, // ✅ ADDED
    }));

    return reply.send({ data: response });
  } catch (err) {
    request.log.error(err);
    reply.code(500).send({ error: 'Internal server error' });
  }
}

export async function getFeaturePermissionsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.server.prisma;

    /* --------------------------------------------------
     * 🔐 AUTH DATA FROM JWT
     * -------------------------------------------------- */
    const authUser = request.user as any;
    const institutionId = Number(authUser?.institution_id);

    if (!institutionId) {
      return reply.code(401).send({
        message: 'Invalid or missing authentication token',
      });
    }

    const { featureCode } = request.params as any;
    const query = request.query as any;
    const roleId = query.roleId ? Number(query.roleId) : undefined;

    /* --------------------------------------------------
       1️⃣ Get institution plan
    -------------------------------------------------- */
    const institution = await prisma.institutions.findUnique({
      where: { id: institutionId },
      select: {
        plan: {
          select: { code: true },
        },
      },
    });

    if (!institution?.plan) {
      return reply.code(400).send({
        message: 'Institution has no plan assigned',
      });
    }

    const planCode = institution.plan.code;

    /* --------------------------------------------------
       2️⃣ Validate feature is included in plan
    -------------------------------------------------- */
    const featureInPlan = await prisma.plan_features.findFirst({
      where: {
        plan_code: planCode,
        feature_code: featureCode,
        included: true,
      },
    });

    if (!featureInPlan) {
      return reply.code(403).send({
        message: 'Feature not available in plan',
      });
    }

    /* --------------------------------------------------
       3️⃣ Fetch permissions for feature
    -------------------------------------------------- */
    const permissions = await prisma.permissions.findMany({
      where: { feature_code: featureCode },
      select: {
        id: true,
        permission_code: true,
        permission_name: true,
        description: true,
        feature_code: true,
        action_type: true,
      },
      orderBy: {
        permission_name: 'asc',
      },
    });

    const allPermissions = permissions.map((p: any) => ({
      id: p.id,
      code: p.permission_code,
      name: p.permission_name,
      description: p.description,
      featureCode: p.feature_code,
      actionType: p.action_type,
    }));

    /* --------------------------------------------------
       4️⃣ Role-based default permissions (optional)
    -------------------------------------------------- */
    let defaultSelectedPermissions: number[] = [];
    let roleInfo: any = null;

    if (roleId) {
      const role = await prisma.roles.findFirst({
        where: {
          id: roleId,
          institution_id: institutionId,
        },
        include: {
          hierarchy: true, // ✅ CORRECT RELATION
        },
      });

      if (role) {
        roleInfo = {
          id: role.id,
          name: role.name,
          hierarchyName: role.hierarchy?.name || null,
          hierarchyLevel: role.hierarchy?.level || null,
        };

        const rolePermissions = await prisma.role_permissions.findMany({
          where: {
            role_id: roleId,
            permission_id: {
              in: permissions.map((p: any) => p.id),
            },
          },
          select: {
            permission_id: true,
          },
        });

        defaultSelectedPermissions = rolePermissions.map((rp: any) => rp.permission_id);
      }
    }

    /* --------------------------------------------------
       5️⃣ Final response
    -------------------------------------------------- */
    return reply.send({
      allPermissions,
      defaultSelectedPermissions,
      roleInfo,
    });
  } catch (err: any) {
    request.log.error(err, 'getFeaturePermissionsHandler failed');
    return reply.code(500).send({
      message: 'Failed to fetch permissions',
    });
  }
}

export async function createInstitutionMemberHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = (request as any).prisma;
    const parts = request.parts();

    const formData: Record<string, any> = {};
    let profilePhotoUrl: string | null = null;

    // 1️⃣ Read multipart fields
    for await (const part of parts) {
      if (part.type === 'file') {
        const filePart = part as MultipartFile;

        const blobService = BlobServiceClient.fromConnectionString(
          process.env.AZURE_STORAGE_CONNECTION_STRING!
        );

        const container = blobService.getContainerClient(process.env.AZURE_CONTAINER_NAME!);

        // Safety (optional but recommended)
        await container.createIfNotExists();

        const blobName = `member-${Date.now()}-${filePart.filename}`;
        const blockBlob = container.getBlockBlobClient(blobName);

        await blockBlob.uploadStream(filePart.file);

        profilePhotoUrl = blockBlob.url;
      } else {
        formData[part.fieldname] = part.value;
      }
    }

    // 2️⃣ Validate input
    const parsed = CreateInstitutionMemberSchema.safeParse(formData);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid request',
        details: parsed.error.issues,
      });
    }

    const { firstName, lastName, email, phoneNumber } = parsed.data;

    // 3️⃣ CREATE using snake_case Prisma model
    const member = await prisma.institution_members.create({
      data: {
        first_name: firstName,
        last_name: lastName,
        email,
        phone_number: phoneNumber,
        profile_photo: profilePhotoUrl,
      },
    });

    return reply.code(201).send({
      data: {
        ...member,
        id: Number(member.id),
      },
      message: 'Member created successfully',
    });
  } catch (err) {
    request.log.error(err, 'createInstitutionMember failed');
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

export async function createUserFlexible(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.prisma;
    const body = request.body as any;
    const payload = body.payload ?? body;

    /* --------------------------------------------------
     * 🔐 AUTH DATA FROM JWT (SINGLE SOURCE OF TRUTH)
     * -------------------------------------------------- */
    const authUser = (request as any).user;

    const institutionId = Number(authUser?.institution_id);
    const createdBy = authUser?.sub ? BigInt(authUser.sub) : null;

    if (!institutionId) {
      return reply.code(401).send({
        error: 'Invalid or missing authentication token',
      });
    }

    const warnings: string[] = [];

    /* --------------------------------------------------
     * Helpers
     * -------------------------------------------------- */
    async function getAvailablePermissionsForPlan(planCode: string) {
      const planFeatures = await prisma.plan_features.findMany({
        where: { plan_code: planCode, included: true },
        select: { feature_code: true },
      });

      const featureCodes = planFeatures.map((pf: any) => pf.feature_code);

      const permissions = await prisma.permissions.findMany({
        where: { feature_code: { in: featureCodes } },
        select: { id: true },
      });

      return permissions.map((p: any) => p.id);
    }

    async function hashPassword(password: string): Promise<string> {
      const bcrypt = require('bcrypt');
      return bcrypt.hash(password, 10);
    }

    /* --------------------------------------------------
     * 1️⃣ Fetch institution + plan
     * -------------------------------------------------- */
    const institution = await prisma.institutions.findUnique({
      where: { id: institutionId },
      include: { plan: true },
    });

    if (!institution?.plan) {
      return reply.code(400).send({
        error: 'Institution has no plan assigned',
      });
    }

    const planCode = institution.plan.code;

    /* --------------------------------------------------
     * 2️⃣ Validate permissions against plan
     * -------------------------------------------------- */
    const availablePermissions = await getAvailablePermissionsForPlan(planCode);

    const invalidPermissions = payload.permissionIds.filter(
      (pid: number) => !availablePermissions.includes(pid)
    );

    if (invalidPermissions.length > 0) {
      return reply.code(400).send({
        error: `These permissions are not available in your plan: ${invalidPermissions.join(', ')}`,
      });
    }

    /* --------------------------------------------------
     * 3️⃣ Role handling
     * -------------------------------------------------- */
    let role: any = null;
    let rolePermissions: number[] = [];

    if (payload.roleId) {
      role = await prisma.roles.findFirst({
        where: {
          id: payload.roleId,
          institution_id: institutionId,
        },
        include: { hierarchy: true },
      });

      if (!role) {
        return reply.code(400).send({
          error: 'Invalid role for this institution',
        });
      }

      const rolePerms = await prisma.role_permissions.findMany({
        where: { role_id: payload.roleId },
        select: { permission_id: true },
      });

      rolePermissions = rolePerms.map((rp: any) => rp.permission_id);

      if (rolePermissions.length === 0) {
        warnings.push(`Role "${role.name}" has no default permissions configured.`);
      }
    } else {
      warnings.push('No role assigned. User will have direct permission assignments only.');
    }

    /* --------------------------------------------------
     * 4️⃣ Check if user already exists
     * -------------------------------------------------- */
    const existingUser = await prisma.users.findFirst({
      where: {
        email: payload.email,
        institution_id: institutionId,
      },
      select: { id: true },
    });

    if (existingUser) {
      return reply.code(409).send({
        error: `User with email "${payload.email}" already exists in this institution`,
      });
    }

    /* --------------------------------------------------
     * 5️⃣ Permission diff logic
     * -------------------------------------------------- */
    const permissionsToGrant = payload.permissionIds.filter(
      (pid: number) => !rolePermissions.includes(pid)
    );

    const permissionsToRevoke = rolePermissions.filter(
      (pid: number) => !payload.permissionIds.includes(pid)
    );

    /* --------------------------------------------------
     * 6️⃣ Fetch modules + features summary
     * -------------------------------------------------- */
    const permissionDetails = await prisma.permissions.findMany({
      where: { id: { in: payload.permissionIds } },
      include: {
        feature: { include: { module: true } },
      },
    });

    const moduleSet = new Set<string>();
    const featureSet = new Set<string>();

    permissionDetails.forEach((p: any) => {
      if (p.feature?.module) moduleSet.add(p.feature.module.code);
      if (p.feature) featureSet.add(p.feature.code);
    });

    /* --------------------------------------------------
     * 7️⃣ Transaction
     * -------------------------------------------------- */
    const result = await prisma.$transaction(async (tx: any) => {
      const user = await tx.users.create({
        data: {
          institution_id: institutionId,
          email: payload.email,
          first_name: payload.firstName,
          last_name: payload.lastName,
          password_hash: payload.password ? await hashPassword(payload.password) : null,
          email_verified: false,
          must_change_password: !payload.password,
          status: 'active',
          updated_at: new Date(),
        },
      });

      if (payload.roleId) {
        await tx.user_roles.create({
          data: {
            user_id: user.id,
            role_id: payload.roleId,
            assigned_by: createdBy,
            assigned_at: new Date(),
          },
        });

        // If faculty role (level 4) and batchIds provided, assign batches
        if (role?.role_hierarchy_id === 4 && payload.batchIds && payload.batchIds.length > 0) {
          // Validate batchIds belong to institution
          const validBatches = await tx.batches.findMany({
            where: {
              id: { in: payload.batchIds },
              institution_id: institutionId,
              is_active: true,
            },
            select: { id: true, metadata: true },
          });

          if (validBatches.length !== payload.batchIds.length) {
            warnings.push('Some batch IDs were invalid and skipped');
          }

          // Store batch assignments in batches metadata
          // TODO: Create a proper batch_faculty junction table for better querying
          for (const batch of validBatches) {
            const metadata = (batch.metadata as any) || {};
            const facultyIds = metadata.faculty_ids || [];

            if (!facultyIds.includes(Number(user.id))) {
              facultyIds.push(Number(user.id));
            }

            await tx.batches.update({
              where: { id: batch.id },
              data: {
                metadata: {
                  ...metadata,
                  faculty_ids: facultyIds,
                },
              },
            });
          }
        }
      }

      if (permissionsToGrant.length > 0) {
        await tx.user_permission_overrides.createMany({
          data: permissionsToGrant.map((pid: number) => ({
            user_id: user.id,
            permission_id: pid,
            override_type: 'grant',
            reason: 'Permission granted during user creation',
            granted_by: createdBy,
            granted_at: new Date(),
          })),
        });
      }

      if (permissionsToRevoke.length > 0) {
        await tx.user_permission_overrides.createMany({
          data: permissionsToRevoke.map((pid: number) => ({
            user_id: user.id,
            permission_id: pid,
            override_type: 'revoke',
            reason: 'Permission revoked during user creation',
            granted_by: createdBy,
            granted_at: new Date(),
          })),
        });
      }

      return {
        userId: Number(user.id),
        email: user.email,
      };
    });
    console.log(result, 'Result');
    if (!result?.userId) {
      request.log.error({ result }, 'User ID missing after creation');
      warnings.push('User created but invite could not be generated (invalid user id)');
    } else {
      try {
        const emailService = new EmailService(request.server.mailer);

        await sendInviteInternal({
          prisma,
          emailService,
          userId: result.userId,
          email: result.email,
          firstName: result.first_name,
          lastName: result.last_name,
          inviteType: payload.inviteType ?? 'faculty',
          institutionName: institution.name,
          institutionCode: institution.code,
          inviterName: authUser?.name,
          role: role?.name,
        });
      } catch (err) {
        request.log.error(err, 'Invite email failed');
        warnings.push('User created, but invite email failed');
      }
    }
    /* --------------------------------------------------
     * 8️⃣ Response
     * -------------------------------------------------- */
    return reply.code(201).send({
      data: {
        userId: result.userId,
        email: result.email,
        roleId: payload.roleId || null,
        roleName: role?.name || null,
        assignedPermissions: payload.permissionIds.length,
        assignedModules: Array.from(moduleSet),
        assignedFeatures: Array.from(featureSet),
      },
      message: 'User created successfully',
      warnings,
    });
  } catch (err: any) {
    request.log.error(err, 'createUserFlexible failed');

    if (err.code === 'P2002') {
      return reply.code(409).send({
        error: 'User already exists',
      });
    }

    return reply.code(500).send({
      error: 'Internal server error',
    });
  }
}

export async function listUsers(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.prisma;

    /* ---------------- AUTH USER ---------------- */

    const userId = BigInt((request as any).user.sub);

    const authUser = await prisma.users.findUnique({
      where: { id: userId },
      select: { institution_id: true },
    });

    if (!authUser?.institution_id) {
      throw new ForbiddenError('No institution linked');
    }

    /* ---------------- QUERY PARAMS ---------------- */

    const {
      page = '1',
      limit = '10',

      // global search
      search,

      // column filters
      email,
      status,
      role,
      department,
      name,
    } = request.query as any;

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

    /* ---------------- WHERE BUILDER ---------------- */

    const where: any = {
      institution_id: authUser.institution_id,
    };

    /* ---------- COLUMN FILTERS ---------- */

    if (email) {
      where.email = { contains: email, mode: 'insensitive' };
    }

    if (status) {
      // enum filter (safe)
      where.status = status;
    }

    if (role || department) {
      where.user_roles = {
        some: {
          role: {
            is_system_role: false,
            ...(role && {
              name: { contains: role, mode: 'insensitive' },
            }),
            ...(department && {
              role_hierarchy_id: 3,
              name: { contains: department, mode: 'insensitive' },
            }),
          },
        },
      };
    }

    /* ---------------- GLOBAL SEARCH (NO STATUS) ---------------- */

    const orConditions: any[] = [];

    if (name) {
      orConditions.push(
        { first_name: { contains: name, mode: 'insensitive' } },
        { last_name: { contains: name, mode: 'insensitive' } }
      );
    }

    if (search) {
      orConditions.push(
        // Name
        { first_name: { contains: search, mode: 'insensitive' } },
        { last_name: { contains: search, mode: 'insensitive' } },

        // Email
        { email: { contains: search, mode: 'insensitive' } },

        // Role
        {
          user_roles: {
            some: {
              role: {
                is_system_role: false,
                name: { contains: search, mode: 'insensitive' },
              },
            },
          },
        },

        // Department
        {
          user_roles: {
            some: {
              role: {
                role_hierarchy_id: 3,
                name: { contains: search, mode: 'insensitive' },
              },
            },
          },
        }
      );
    }

    if (orConditions.length > 0) {
      where.OR = orConditions;
    }

    /* ---------------- PAGINATED QUERY ---------------- */

    const [rows, meta] = await prisma.users
      .paginate({
        where,
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          status: true,
          last_login_at: true,
          user_roles: {
            where: {
              role: { is_system_role: false },
            },
            take: 1,
            select: {
              role: {
                select: {
                  name: true,
                  role_hierarchy_id: true,
                },
              },
            },
          },
        },
        orderBy: { created_at: 'desc' },
      })
      .withPages({
        page: pageNumber,
        limit: limitNumber,
      });

    /* ---------------- RESPONSE MAPPING ---------------- */

    const data = rows.map((u: any) => {
      const role = u.user_roles[0]?.role ?? null;

      return {
        id: u.id.toString(),
        name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
        email: u.email,
        role: role?.name ?? null,
        department: role?.role_hierarchy_id === 3 ? role.name : null,
        status: u.status,
        lastLoginAt: u.last_login_at,
      };
    });

    /* ---------------- FINAL RESPONSE ---------------- */

    return reply.send({
      data,
      meta: {
        ...meta,
        currentPageCount: data.length,
      },
    });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({
      error: 'Internal server error',
    });
  }
}

export async function bulkCreateUsersFromExcel(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.server.prisma;

    let fileBuffer: Buffer | null = null;
    let institutionId: number | null = null;
    let createdBy: number | null = null;

    // ------------------------------
    // READ MULTIPART
    // ------------------------------
    for await (const part of request.parts()) {
      if (part.type === 'file' && part.fieldname === 'file') {
        fileBuffer = await part.toBuffer();
      }

      if (part.type === 'field') {
        if (part.fieldname === 'institutionId') {
          institutionId = Number(part.value);
        }
        if (part.fieldname === 'createdBy') {
          createdBy = Number(part.value);
        }
      }
    }

    if (!fileBuffer) {
      return reply.code(400).send({ error: 'Excel file is required' });
    }

    if (!institutionId) {
      return reply.code(400).send({ error: 'institutionId is required' });
    }

    // ------------------------------
    // READ EXCEL
    // ------------------------------
    const workbook = XLSX.read(fileBuffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    // ------------------------------
    // FETCH INSTITUTION + PLAN
    // ------------------------------
    const institution = await prisma.institutions.findUnique({
      where: { id: institutionId },
      include: { plan: true },
    });

    if (!institution?.plan) {
      return reply.code(400).send({
        error: 'Institution has no plan assigned',
      });
    }

    const planCode = institution.plan.code;

    // ------------------------------
    // ALLOWED PERMISSIONS
    // ------------------------------
    const planFeatures = await prisma.plan_features.findMany({
      where: { plan_code: planCode, included: true },
      select: { feature_code: true },
    });

    const featureCodes = planFeatures.map((p: any) => p.feature_code);

    const allowedPermissions = await prisma.permissions.findMany({
      where: { feature_code: { in: featureCodes } },
      select: { id: true },
    });

    const allowedPermissionIds = allowedPermissions.map((p: any) => p.id);

    // ------------------------------
    // RESULT BUCKETS
    // ------------------------------
    const success: any[] = [];
    const failed: any[] = [];
    const warnings: string[] = [];

    // ------------------------------
    // PROCESS ROWS
    // ------------------------------
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const excelRow = i + 2;

      try {
        if (!row.email || !row.firstName || !row.lastName) {
          throw new Error('email, firstName, lastName are required');
        }

        const permissionIds = String(row.permissionIds)
          .split(',')
          .map((x: string) => Number(x.trim()))
          .filter(Boolean);

        const invalidPermissions = permissionIds.filter(
          (pid) => !allowedPermissionIds.includes(pid)
        );

        if (invalidPermissions.length > 0) {
          throw new Error(`Invalid permissions: ${invalidPermissions.join(', ')}`);
        }

        // ------------------------------
        // ROLE HANDLING
        // ------------------------------
        let roleName: string | null = null;

        if (row.roleId) {
          const role = await prisma.roles.findUnique({
            where: { id: Number(row.roleId) },
          });

          if (!role) {
            throw new Error('Invalid roleId');
          }

          roleName = role.name;

          const rolePerms = await prisma.role_permissions.findMany({
            where: { role_id: Number(row.roleId) },
          });

          if (rolePerms.length === 0) {
            warnings.push(`Row ${excelRow}: Role "${role.name}" has no default permissions`);
          }
        }

        // ------------------------------
        // TRANSACTION
        // ------------------------------
        await prisma.$transaction(async (tx: any) => {
          const user = await tx.users.create({
            data: {
              institution_id: institutionId,
              email: row.email,
              first_name: row.firstName,
              last_name: row.lastName,
              password_hash: row.password ? await bcrypt.hash(row.password, 10) : null,
              must_change_password: !row.password,
              status: 'active',
            },
          });

          if (row.roleId) {
            await tx.user_roles.create({
              data: {
                user_id: user.id,
                role_id: Number(row.roleId),
                assigned_by: createdBy,
              },
            });
          }
        });

        success.push({
          row: excelRow,
          email: row.email,
          role: roleName,
        });
      } catch (err: any) {
        failed.push({
          row: excelRow,
          email: row.email || null,
          error: err.message,
        });
      }
    }

    return reply.code(201).send({
      summary: {
        totalRows: rows.length,
        successCount: success.length,
        failedCount: failed.length,
      },
      success,
      failed,
      warnings,
      message: 'Bulk user creation completed',
    });
  } catch (err) {
    request.log.error(err, 'bulkCreateUsersFromExcel failed');
    return reply.code(500).send({
      error: 'Internal server error',
    });
  }
}

export async function changeUserStatus(
  request: FastifyRequest<{
    Params: ChangeUserStatusParams;
    Body: ChangeUserStatusBody;
  }>,
  reply: FastifyReply
) {
  try {
    const prisma = request.server.prisma;
    const { id } = request.params;
    const { status } = request.body;

    // ✅ Validate status against enum
    if (!['active', 'suspended'].includes(status)) {
      return reply.code(400).send({
        error: 'Invalid status. Allowed values: active, suspended',
      });
    }

    // ✅ Prisma users.id is BigInt
    const userId = BigInt(id);

    // ✅ Soft delete (status update only)
    const updatedUser = await prisma.users.update({
      where: { id: userId },
      data: {
        status,
      },
      select: {
        id: true,
        email: true,
        status: true,
        updated_at: true,
      },
    });

    return reply.code(200).send({
      message: `User status updated to ${status}`,
      user: {
        id: updatedUser.id.toString(), // BigInt → string
        email: updatedUser.email,
        status: updatedUser.status,
        updatedAt: updatedUser.updated_at,
      },
    });
  } catch (err: any) {
    request.log.error(err, 'changeUserStatus failed');

    return reply.code(500).send({
      error: 'Failed to update user status',
    });
  }
}

/**
 * GET /api/users/:userId/edit
 * Fetches user data for edit mode with calculated final permissions
 */
export async function getUserForEdit(
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply
) {
  try {
    const prisma = request.prisma;
    const authUser = request.user as any;
    const institutionId = Number(authUser?.institution_id);
    const userId = BigInt(request.params.userId);

    if (!institutionId) {
      return reply.code(401).send({ error: 'Invalid or missing authentication token' });
    }

    /* 1️⃣ Fetch user */
    const user = await prisma.users.findFirst({
      where: {
        id: userId,
        institution_id: institutionId,
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    /* 2️⃣ Fetch role + hierarchy */
    const userRole = await prisma.user_roles.findFirst({
      where: { user_id: userId },
      include: {
        role: {
          include: { hierarchy: true },
        },
      },
    });

    /* 3️⃣ Fetch role permissions */
    let rolePermissionIds: number[] = [];
    if (userRole?.role) {
      const rolePerms = await prisma.role_permissions.findMany({
        where: { role_id: userRole.role.id },
        select: { permission_id: true },
      });
      rolePermissionIds = rolePerms.map((rp: any) => rp.permission_id);
    }

    /* 4️⃣ Fetch user overrides */
    const overrides = await prisma.user_permission_overrides.findMany({
      where: { user_id: userId },
    });

    const granted = overrides
      .filter((o: any) => o.override_type === 'grant')
      .map((o: any) => o.permission_id);

    const revoked = overrides
      .filter((o: any) => o.override_type === 'revoke')
      .map((o: any) => o.permission_id);

    /* 5️⃣ Calculate final permissions */
    const finalPermissionIds = [
      ...new Set(rolePermissionIds.filter((pid: number) => !revoked.includes(pid)).concat(granted)),
    ];

    /* 6️⃣ Fetch all permissions with feature & module */
    const permissions = await prisma.permissions.findMany({
      include: {
        feature: {
          include: { module: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    /* 7️⃣ Build permission tree */
    const moduleMap = new Map<string, any>();
    for (const perm of permissions) {
      const feature = (perm as any).feature;
      const module = feature?.module;
      if (!feature || !module) continue;

      if (!moduleMap.has(module.code)) {
        moduleMap.set(module.code, {
          moduleCode: module.code,
          moduleName: module.name,
          features: new Map<string, any>(),
        });
      }

      const moduleEntry = moduleMap.get(module.code);
      if (!moduleEntry.features.has(feature.code)) {
        moduleEntry.features.set(feature.code, {
          featureCode: feature.code,
          featureName: feature.name,
          permissions: [],
        });
      }

      moduleEntry.features.get(feature.code).permissions.push({
        permissionId: perm.id,
        permissionName: perm.permission_name,
        checked: finalPermissionIds.includes(perm.id),
      });
    }

    const permissionTree = Array.from(moduleMap.values()).map((m: any) => ({
      moduleCode: m.moduleCode,
      moduleName: m.moduleName,
      features: Array.from(m.features.values()),
    }));

    /* 8️⃣ Fetch batch assignments for faculty users */
    let batchIds: number[] = [];
    if (userRole?.role?.role_hierarchy_id === 4) {
      // Faculty role (hierarchy level 4)
      const batches = await prisma.batches.findMany({
        where: {
          institution_id: institutionId,
          is_active: true,
        },
        select: {
          id: true,
          metadata: true,
        },
      });

      batchIds = batches
        .filter((batch: { id: number; metadata: any }) => {
          const metadata = (batch.metadata as any) || {};
          const facultyIds = metadata.faculty_ids || [];
          return facultyIds.includes(Number(userId));
        })
        .map((batch: { id: number; metadata: any }) => batch.id);
    }

    return reply.send({
      user: {
        id: user.id.toString(),
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        status: user.status,
      },
      role: userRole?.role
        ? {
            id: userRole.role.id,
            name: userRole.role.name,
            roleHierarchyId: userRole.role.hierarchy?.id ?? null,
            roleHierarchyName: userRole.role.hierarchy?.name ?? null,
          }
        : null,
      permissions: permissionTree,
      batchIds,
    });
  } catch (err: any) {
    request.log.error(err, 'getUserForEdit failed');
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

/**
 * PUT /api/users/:userId
 * Updates user profile, role, and permissions with diff logic
 */
export async function updateUserFlexible(
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply
) {
  try {
    const prisma = request.prisma;
    const authUser = request.user as any;
    const institutionId = Number(authUser?.institution_id);
    const userId = BigInt(request.params.userId);
    const updatedBy = authUser?.sub ? BigInt(authUser.sub) : null;
    const body = request.body as any;
    const payload = body.payload ?? body;

    if (!institutionId) {
      return reply.code(401).send({ error: 'Invalid or missing authentication token' });
    }

    /* 1️⃣ Validate user */
    const user = await prisma.users.findFirst({
      where: {
        id: userId,
        institution_id: institutionId,
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    /* 2️⃣ Validate role and fetch role permissions */
    let rolePermissionIds: number[] = [];
    if (payload.roleId) {
      const role = await prisma.roles.findFirst({
        where: {
          id: payload.roleId,
          institution_id: institutionId,
        },
      });

      if (!role) {
        return reply.code(400).send({ error: 'Invalid role for this institution' });
      }

      const rolePerms = await prisma.role_permissions.findMany({
        where: { role_id: payload.roleId },
        select: { permission_id: true },
      });
      rolePermissionIds = rolePerms.map((rp: any) => rp.permission_id);
    }

    /* 3️⃣ Calculate permission diff */
    const permissionsToGrant = (payload.permissionIds || []).filter(
      (pid: number) => !rolePermissionIds.includes(pid)
    );
    const permissionsToRevoke = rolePermissionIds.filter(
      (pid: number) => !(payload.permissionIds || []).includes(pid)
    );

    /* 4️⃣ Transaction */
    await prisma.$transaction(async (tx: any) => {
      // Update user profile
      await tx.users.update({
        where: { id: userId },
        data: {
          first_name: payload.firstName,
          last_name: payload.lastName,
          updated_at: new Date(),
        },
      });

      // Update role
      await tx.user_roles.deleteMany({ where: { user_id: userId } });
      if (payload.roleId) {
        await tx.user_roles.create({
          data: {
            user_id: userId,
            role_id: payload.roleId,
            assigned_by: updatedBy,
            assigned_at: new Date(),
          },
        });
      }

      // Reset permission overrides
      await tx.user_permission_overrides.deleteMany({
        where: { user_id: userId },
      });

      // Insert grants
      if (permissionsToGrant.length > 0) {
        await tx.user_permission_overrides.createMany({
          data: permissionsToGrant.map((pid: number) => ({
            user_id: userId,
            permission_id: pid,
            override_type: 'grant',
            reason: 'Granted during user update',
            granted_by: updatedBy,
            granted_at: new Date(),
          })),
        });
      }

      // Insert revokes
      if (permissionsToRevoke.length > 0) {
        await tx.user_permission_overrides.createMany({
          data: permissionsToRevoke.map((pid: number) => ({
            user_id: userId,
            permission_id: pid,
            override_type: 'revoke',
            reason: 'Revoked during user update',
            granted_by: updatedBy,
            granted_at: new Date(),
          })),
        });
      }
    });

    return reply.send({ message: 'User updated successfully' });
  } catch (err: any) {
    request.log.error(err, 'updateUserFlexible failed');
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

export async function getStudentUsers(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.server.prisma;

    const users = await prisma.users.findMany({
      where: {
        user_roles: {
          some: {
            role: {
              name: 'Student',
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
        status: true,
        updated_at: true,
        user_roles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return reply.code(200).send({
      message: 'Student users fetched successfully',
      count: users.length,
      users: users.map((user: any) => ({
        id: user.id.toString(),
        email: user.email,
        status: user.status,
        roles: user.user_roles.map((ur: any) => ur.role.name),
        updatedAt: user.updated_at,
      })),
    });
  } catch (err: any) {
    request.log.error(err, 'getStudentUsers failed');

    return reply.code(500).send({
      error: 'Failed to fetch student users',
    });
  }
}
