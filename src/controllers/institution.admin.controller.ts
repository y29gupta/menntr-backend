import type { FastifyRequest, FastifyReply } from 'fastify';
import z, { any } from 'zod';
import { ValidationError } from '../utils/errors';
import { BlobServiceClient } from '@azure/storage-blob';
import { MultipartFile } from '@fastify/multipart';

const CreateInstitutionMemberSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(1),
  email: z.string().email(),
  phoneNumber: z.string().optional().nullable(),
});

type GetFeaturesParams = {
  moduleId: string;
};

type Params = {
  hierarchyId: string;
};

type featuresParams = {
  featureCode: string;
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

    const hierarchyId = Number(request.params.hierarchyId);

    const rows = await prisma.$queryRaw<{ role_name: string }[]>`
      SELECT r.name AS role_name
      FROM roles r
      WHERE r.role_hierarchy_id = ${hierarchyId}
      ORDER BY r.name ASC
    `;

    return reply.code(200).send({
      data: {
        roleHierarchyId: hierarchyId,
        roles: rows.map((r: any) => r.role_name),
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

    const modules = await prisma.module.findMany({
      select: {
        id: true,
        name: true,
      },
    });

    return reply.code(200).send({
      data: {
        modules: modules.map((m: any) => ({
          id: m.id,
          name: m.name,
        })),
      },
    });
  } catch (err) {
    request.log.error({ err }, 'getModulesHandler failed');

    return reply.code(500).send({
      error: 'Internal server error',
    });
  }
}


// export async function getAvailableModules(
//   institutionId: number
// ): Promise<ModuleResponse[]> {
//   try {
//     // Get institution's plan
//     const institution = await prisma.institutions.findUnique({
//       where: { id: institutionId },
//       select: {
//         plan_id: true,
//         plans: {
//           select: {
//             code: true,
//           },
//         },
//       },
//     });

//     if (!institution?.plan_id || !institution.plans) {
//       throw new Error('Institution has no plan assigned');
//     }

//     const planCode = institution.plans.code;

//     // Get modules included in the plan
//     const planModules = await prisma.plan_modules.findMany({
//       where: {
//         plan_id: institution.plan_id,
//         included: true,
//       },
//       select: {
//         modules: {
//           select: {
//             id: true,
//             code: true,
//             name: true,
//             description: true,
//             icon: true,
//             category: true,
//             is_core: true,
//           },
//         },
//       },
//     });

//     // Get features included in the plan
//     const planFeatures = await prisma.plan_features.findMany({
//       where: {
//         plan_code: planCode,
//         included: true,
//       },
//       select: {
//         feature_code: true,
//       },
//     });

//     const featureCodes = planFeatures.map((pf) => pf.feature_code);

//     // Build module response with features and permissions
//     const modules: ModuleResponse[] = [];

//     for (const pm of planModules) {
//       const module = pm.modules;

//       // Get features for this module that are in the plan
//       const features = await prisma.features.findMany({
//         where: {
//           module_id: module.id,
//           code: {
//             in: featureCodes,
//           },
//         },
//         select: {
//           id: true,
//           code: true,
//           name: true,
//           description: true,
//           module_id: true,
//         },
//       });

//       // Get permissions for each feature
//       const featuresWithPermissions: FeatureResponse[] = [];

//       for (const feature of features) {
//         const permissions = await prisma.permissions.findMany({
//           where: {
//             feature_code: feature.code,
//           },
//           select: {
//             id: true,
//             permission_code: true,
//             permission_name: true,
//             description: true,
//             feature_code: true,
//             action_type: true,
//           },
//         });

//         featuresWithPermissions.push({
//           id: feature.id,
//           code: feature.code,
//           name: feature.name,
//           description: feature.description,
//           moduleId: feature.module_id,
//           permissions: permissions.map((p) => ({
//             id: p.id,
//             code: p.permission_code,
//             name: p.permission_name,
//             description: p.description,
//             featureCode: p.feature_code,
//             actionType: p.action_type,
//           })),
//         });
//       }

//       modules.push({
//         id: module.id,
//         code: module.code,
//         name: module.name,
//         description: module.description,
//         icon: module.icon,
//         category: module.category,
//         isCore: module.is_core,
//         features: featuresWithPermissions,
//       });
//     }

//     return modules;
//   } catch (error) {
//     console.error('Error fetching available modules:', error);
//     throw new Error('Failed to fetch available modules');
//   }
// }



export async function getModuleFeaturesHandler(
  request: FastifyRequest<{ Params: GetFeaturesParams }>,
  reply: FastifyReply
) {
  try {
    const prisma = request.server.prisma;

    const moduleId = Number(request.params.moduleId);

    const features = await prisma.feature.findMany({
      where: { moduleId },
      select: {
        code: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    });

    return reply.code(200).send({
      data: {
        moduleId,
        features: features.map((f: any) => ({
          code: f.code,
          name: f.name,
        })),
      },
    });
  } catch (err) {
    request.log.error({ err }, 'getModuleFeaturesHandler failed');

    return reply.code(500).send({
      error: 'Internal server error',
    });
  }
}

export async function getFeaturesWithPermissionsHandler(
  request: FastifyRequest<{ Params: featuresParams }>,
  reply: FastifyReply
) {
  try {
    const prisma = request.server.prisma;

    const featureCode = request.params.featureCode;

    const rows = await prisma.$queryRaw<
      {
        feature_code: string;
        feature_name: string | null;
        permission_id: number | null;
        permission_code: string | null;
        permission_name: string | null;
      }[]
    >`
      SELECT 
        f.code AS feature_code,
        f.name AS feature_name,
        p.id   AS permission_id,
        p.permission_code,
        p.permission_name
      FROM features f
      LEFT JOIN permissions p
        ON p.feature_code = f.code
      WHERE f.code = ${featureCode}
      ORDER BY f.name ASC, p.permission_code ASC
    `;

    if (!rows.length) {
      return reply.code(404).send({
        error: 'Feature not found',
      });
    }

    const featureNames = new Set<string>();
    const permissionMap = new Map<number, { id: number; code: string; name: string }>();

    rows.forEach((row: any) => {
      if (row.feature_name) featureNames.add(row.feature_name);

      if (row.permission_id) {
        permissionMap.set(row.permission_id, {
          id: row.permission_id,
          code: row.permission_code ?? '',
          name: row.permission_name ?? '',
        });
      }
    });

    return reply.code(200).send({
      data: {
        featureCode,
        featureNames: Array.from(featureNames),
        permissions: Array.from(permissionMap.values()),
      },
    });
  } catch (err) {
    request.log.error({ err }, 'getPermissionsByFeatureCodeHandler failed');

    return reply.code(500).send({
      error: 'Internal server error',
    });
  }
}

export async function createInstitutionMemberHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = (request as any).prisma;
    const parts = request.parts();

    const formData: Record<string, any> = {};
    let profilePhotoUrl: string | null = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        const filePart = part as MultipartFile;

        const blobService = BlobServiceClient.fromConnectionString(
          process.env.AZURE_STORAGE_CONNECTION_STRING!
        );

        const container = blobService.getContainerClient(process.env.AZURE_CONTAINER_NAME!);

        const blobName = `member-${Date.now()}-${filePart.filename}`;
        const blockBlob = container.getBlockBlobClient(blobName);

        await blockBlob.uploadStream(filePart.file);

        profilePhotoUrl = blockBlob.url;
      } else {
        formData[part.fieldname] = part.value;
      }
    }

    const parsed = CreateInstitutionMemberSchema.safeParse(formData);

    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid request',
        details: parsed.error.issues,
      });
    }

    const { firstName, lastName, email, phoneNumber } = parsed.data;

    const member = await prisma.institutionMember.create({
      data: {
        firstName,
        lastName,
        email,
        phoneNumber,
        profilePhoto: profilePhotoUrl,
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
