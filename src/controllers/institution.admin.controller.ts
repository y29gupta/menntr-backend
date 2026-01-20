import type { FastifyRequest, FastifyReply } from 'fastify';
import z from 'zod';
import { ForbiddenError } from '../utils/errors';
import { BlobServiceClient } from '@azure/storage-blob';
import { MultipartFile } from '@fastify/multipart';
import XLSX from 'xlsx';
import bcrypt from 'bcrypt';

const CreateInstitutionMemberSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(1),
  email: z.string().email(),
  phoneNumber: z.string().optional().nullable(),
});

type Params = {
  hierarchyId: string;
};

interface ModuleResponse {
  id: number;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  isCore: boolean;
  features: FeatureResponse[];
}

interface FeatureResponse {
  id: number;
  code: string;
  name: string;
  description: string | null;
  moduleId: number;
  permissions: PermissionResponse[];
}

interface PermissionResponse {
  id: number;
  code: string;
  name: string;
  description: string | null;
  featureCode: string;
  actionType: string | null;
}

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

    const hierarchyId = Number(request.params.hierarchyId);

    const rows = await prisma.$queryRaw<{ id: number; role_name: string }[]>`
      SELECT 
        r.id,
        r.name AS role_name
      FROM roles r
      WHERE r.role_hierarchy_id = ${hierarchyId}
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

// Get all modules Features Based on th plan
export async function getAvailableModulesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.server.prisma;

    const currentUser: any = request.user;
    // console.log('currentUser', currentUser);
    if (!currentUser?.institutionId) {
      return reply.code(400).send({
        error: 'Institution ID missing in user context',
      });
    }

    const institutionId = Number(currentUser.institutionId);

    console.log(institutionId, 'institutionId');

    // Get institution's plan
    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: {
        planId: true,
        plan: {
          select: {
            code: true,
          },
        },
      },
    });

    if (!institution?.planId || !institution.plan) {
      return reply.code(400).send({
        error: 'Institution has no plan assigned',
      });
    }

    const planCode = institution.plan.code;

    // Get modules included in the plan
    const planModules = await prisma.planModule.findMany({
      where: {
        planId: institution.planId,
        included: true,
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
            isCore: true,
          },
        },
      },
    });

    // Get features included in the plan
    const planFeatures = await prisma.planFeature.findMany({
      where: {
        planCode: planCode,
        included: true,
      },
      select: {
        featureCode: true,
      },
    });

    const featureCodes = planFeatures.map((pf: any) => pf.featureCode);

    const modules: ModuleResponse[] = [];

    for (const pm of planModules) {
      const module = pm.module;

      const features = await prisma.feature.findMany({
        where: {
          moduleId: module.id,
          code: { in: featureCodes },
        },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          moduleId: true,
        },
      });

      const featuresWithPermissions: FeatureResponse[] = [];

      for (const feature of features) {
        const permissions = await prisma.permission.findMany({
          where: { featureCode: feature.code },
          select: {
            id: true,
            permissionCode: true,
            permissionName: true,
            description: true,
            featureCode: true,
            actionType: true,
          },
        });

        featuresWithPermissions.push({
          id: feature.id,
          code: feature.code,
          name: feature.name,
          description: feature.description,
          moduleId: feature.moduleId,
          permissions: permissions.map((p: any) => ({
            id: p.id,
            code: p.permissionCode,
            name: p.permissionName,
            description: p.description,
            featureCode: p.featureCode,
            actionType: p.actionType,
          })),
        });
      }

      modules.push({
        id: module.id,
        code: module.code,
        name: module.name,
        description: module.description,
        icon: module.icon,
        category: module.category,
        isCore: module.isCore,
        features: featuresWithPermissions,
      });
    }

    return reply.code(200).send({
      data: { modules },
    });
  } catch (err) {
    request.log.error({ err }, 'getAvailableModulesHandler failed');
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

export async function getModulesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.server.prisma;
    const currentUser = request.user;

    if (!currentUser?.institution_id) {
      return reply.code(400).send({
        error: 'Institution ID missing',
      });
    }

    /**
     * 1️⃣ Get institution plan
     */
    const institution = await prisma.institutions.findUnique({
      where: {
        id: currentUser.institution_id,
      },
      select: {
        plan_id: true,
      },
    });

    if (!institution?.plan_id) {
      return reply.code(400).send({
        error: 'Institution has no plan',
      });
    }

    /**
     * 2️⃣ Get plan modules + institution overrides
     */
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
          sort_order: 'asc',
        },
      },
    });

    /**
     * 3️⃣ Response
     */
    return reply.send({
      data: planModules.map((pm: any) => pm.module),
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

    const features = await prisma.features.findMany({
      where: {
        module_id: Number(moduleId),
        code: {
          in: allowedFeatureCodes,
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
      },
      orderBy: {
        sort_order: 'asc',
      },
    });

    return reply.send({ data: features });
  } catch (err) {
    request.log.error(err);
    reply.code(500).send({ error: 'Internal server error' });
  }
}

export async function getFeaturePermissionsHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.server.prisma;
    const { featureCode } = request.params as any;

    const permissions = await prisma.permissions.findMany({
      where: { feature_code: featureCode },
      select: {
        id: true,
        permission_code: true,
        permission_name: true,
        description: true,
        action_type: true,
      },
    });
    console.log('permissions', permissions);
    return reply.send({
      data: permissions.map((p: any) => ({
        id: p.id,
        code: p.permission_code,
        name: p.permission_name,
        description: p.description,
        action_type: p.action_type,
      })),
    });
  } catch (err) {
    request.log.error(err);
    reply.code(500).send({ error: 'Internal server error' });
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

export async function listUsers(req: FastifyRequest, reply: FastifyReply) {
  const prisma = req.prisma;

  const user_id = BigInt((req as any).user.sub);

  const authUser = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!authUser?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const { page = 1, limit = 10, search = '', status } = req.query as any;

  const where: any = {
    institution_id: authUser.institution_id,
    email: {
      contains: search,
      mode: 'insensitive',
    },
  };

  if (status) {
    where.status = status;
  }

  // 🔹 Fetch users + count
  const [rows, total] = await Promise.all([
    prisma.users.findMany({
      where,
      include: {
        user_roles: {
          include: {
            role: {
              include: {
                parent: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    }),

    prisma.users.count({ where }),
  ]);

  const data = rows.map((u: any) => {
    const roleEntry = u.user_roles.find((ur: any) => !ur.role.is_system_role);

    const role = roleEntry?.role ?? null;

    const department = role?.role_hierarchy_id === 3 ? role.name : null;

    return {
      id: u.id.toString(),
      name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
      email: u.email,
      role: role?.name ?? null,
      department,
      status: u.status,
      lastLoginAt: u.last_login_at,
    };
  });

  reply.send({
    total,
    page: Number(page),
    limit: Number(limit),
    data,
  });
}

/**
 * This is the structure we expect for effective permissions.
 * (You can extend later as needed.)
 */
type PermissionInfo = {
  id: number;
  source?: 'role' | 'override';
};

/**
 * Placeholder — return real permissions later.
 */
async function getUserEffectivePermissions(userId: bigint): Promise<PermissionInfo[]> {
  return [];
}

export async function getUserAccessSummaryHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.server.prisma;

    const params = request.params as any;

    const userId = BigInt(params.userId);

    // -----------------------------
    // 1️⃣ Get user + institution + plan
    // -----------------------------
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        institution: {
          select: {
            name: true,
            plan: {
              select: {
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return reply.code(404).send({
        error: 'User not found',
      });
    }

    // -----------------------------
    // 2️⃣ Roles
    // -----------------------------
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            hierarchy: true,
          },
        },
      },
    });

    // -----------------------------
    // 3️⃣ Effective permissions
    // -----------------------------
    const permissions = await getUserEffectivePermissions(userId);

    // -----------------------------
    // 4️⃣ Group: Module → Feature → Permission
    // -----------------------------
    const moduleMap = new Map<
      string,
      {
        id: number;
        code: string;
        name: string;
        features: Map<
          string,
          {
            id: number;
            code: string;
            name: string;
            permissions: PermissionInfo[];
          }
        >;
      }
    >();

    for (const perm of permissions) {
      const permDetail = await prisma.permission.findUnique({
        where: { id: perm.id },
        include: {
          feature: {
            include: { module: true },
          },
        },
      });

      if (!permDetail?.feature?.module) continue;

      const module = permDetail.feature.module;
      const feature = permDetail.feature;

      if (!moduleMap.has(module.code)) {
        moduleMap.set(module.code, {
          id: module.id,
          code: module.code,
          name: module.name,
          features: new Map(),
        });
      }

      const moduleEntry = moduleMap.get(module.code)!;

      if (!moduleEntry.features.has(feature.code)) {
        moduleEntry.features.set(feature.code, {
          id: feature.id,
          code: feature.code,
          name: feature.name,
          permissions: [],
        });
      }

      moduleEntry.features.get(feature.code)!.permissions.push(perm);
    }

    const modules = Array.from(moduleMap.values()).map((m) => ({
      ...m,
      features: Array.from(m.features.values()),
    }));

    return reply.code(200).send({
      data: {
        user: {
          id: Number(user.id),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          institutionName: user.institution?.name,
          planName: user.institution?.plan?.name,
          planCode: user.institution?.plan?.code,
        },

        roles: userRoles.map((ur: any) => ({
          id: ur.role.id,
          name: ur.role.name,
          hierarchyName: ur.role.hierarchy?.name,
          hierarchyLevel: ur.role.hierarchy?.level,
        })),

        summary: {
          totalPermissions: permissions.length,
          totalModules: modules.length,
          totalFeatures: modules.reduce((sum, m) => sum + m.features.length, 0),
          permissionsFromRole: permissions.filter((p: any) => p.source === 'role').length,
          permissionsFromOverride: permissions.filter((p: any) => p.source === 'override').length,
        },

        modules,
      },
    });
  } catch (err) {
    request.log.error(err, 'getUserAccessSummary failed');

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
