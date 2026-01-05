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

    const roles = await prisma.roleHierarchy.findMany({
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

// Get all modules Features Based on th plan
export async function getAvailableModulesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const prisma = request.server.prisma;

    const currentUser: any = request.user;
    console.log('currentUser', currentUser);
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

// export async function getRoleDefaultPermissions(prisma: any, roleId: number): Promise<number[]> {
//   try {
//     const rolePermissions = await prisma.role_permissions.findMany({
//       where: {
//         role_id: roleId,
//       },
//       select: {
//         permission_id: true,
//       },
//     });

//     return rolePermissions.map((rp: any) => rp.permission_id);
//   } catch (error) {
//     console.error('Error fetching role default permissions:', error);
//     throw new Error('Failed to fetch role permissions');
//   }
// }

/**
 * Get all available permissions for a plan new added
 */
// async function getAvailablePermissionsForPlan(planCode: string): Promise<number[]> {
//   try {
//     // Get all features in the plan
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

//     // Get all permissions for these features
//     const permissions = await prisma.permissions.findMany({
//       where: {
//         feature_code: {
//           in: featureCodes,
//         },
//       },
//       select: {
//         id: true,
//       },
//     });

//     return permissions.map((p) => p.id);
//   } catch (error) {
//     console.error('Error fetching available permissions:', error);
//     throw new Error('Failed to fetch available permissions');
//   }
// }

// check whether required or not
// export async function getModuleFeaturesHandler(
//   request: FastifyRequest<{ Params: GetFeaturesParams }>,
//   reply: FastifyReply
// ) {
//   try {
//     const prisma = request.server.prisma;

//     const moduleId = Number(request.params.moduleId);

//     const features = await prisma.feature.findMany({
//       where: { moduleId },
//       select: {
//         code: true,
//         name: true,
//       },
//       orderBy: { name: 'asc' },
//     });

//     return reply.code(200).send({
//       data: {
//         moduleId,
//         features: features.map((f: any) => ({
//           code: f.code,
//           name: f.name,
//         })),
//       },
//     });
//   } catch (err) {
//     request.log.error({ err }, 'getModuleFeaturesHandler failed');

//     return reply.code(500).send({
//       error: 'Internal server error',
//     });
//   }
// }

// // check whether required or not
// export async function getFeaturesWithPermissionsHandler(
//   request: FastifyRequest<{ Params: featuresParams }>,
//   reply: FastifyReply
// ) {
//   try {
//     const prisma = request.server.prisma;

//     const featureCode = request.params.featureCode;

//     const rows = await prisma.$queryRaw<
//       {
//         feature_code: string;
//         feature_name: string | null;
//         permission_id: number | null;
//         permission_code: string | null;
//         permission_name: string | null;
//       }[]
//     >`
//       SELECT
//         f.code AS feature_code,
//         f.name AS feature_name,
//         p.id   AS permission_id,
//         p.permission_code,
//         p.permission_name
//       FROM features f
//       LEFT JOIN permissions p
//         ON p.feature_code = f.code
//       WHERE f.code = ${featureCode}
//       ORDER BY f.name ASC, p.permission_code ASC
//     `;

//     if (!rows.length) {
//       return reply.code(404).send({
//         error: 'Feature not found',
//       });
//     }

//     const featureNames = new Set<string>();
//     const permissionMap = new Map<number, { id: number; code: string; name: string }>();

//     rows.forEach((row: any) => {
//       if (row.feature_name) featureNames.add(row.feature_name);

//       if (row.permission_id) {
//         permissionMap.set(row.permission_id, {
//           id: row.permission_id,
//           code: row.permission_code ?? '',
//           name: row.permission_name ?? '',
//         });
//       }
//     });

//     return reply.code(200).send({
//       data: {
//         featureCode,
//         featureNames: Array.from(featureNames),
//         permissions: Array.from(permissionMap.values()),
//       },
//     });
//   } catch (err) {
//     request.log.error({ err }, 'getPermissionsByFeatureCodeHandler failed');

//     return reply.code(500).send({
//       error: 'Internal server error',
//     });
//   }
// }

// check whether required or not
// export async function createInstitutionMemberHandler(request: FastifyRequest, reply: FastifyReply) {
//   try {
//     const prisma = (request as any).prisma;
//     const parts = request.parts();

//     const formData: Record<string, any> = {};
//     let profilePhotoUrl: string | null = null;

//     for await (const part of parts) {
//       if (part.type === 'file') {
//         const filePart = part as MultipartFile;

//         const blobService = BlobServiceClient.fromConnectionString(
//           process.env.AZURE_STORAGE_CONNECTION_STRING!
//         );

//         const container = blobService.getContainerClient(process.env.AZURE_CONTAINER_NAME!);

//         const blobName = `member-${Date.now()}-${filePart.filename}`;
//         const blockBlob = container.getBlockBlobClient(blobName);

//         await blockBlob.uploadStream(filePart.file);

//         profilePhotoUrl = blockBlob.url;
//       } else {
//         formData[part.fieldname] = part.value;
//       }
//     }

//     const parsed = CreateInstitutionMemberSchema.safeParse(formData);

//     if (!parsed.success) {
//       return reply.code(400).send({
//         error: 'Invalid request',
//         details: parsed.error.issues,
//       });
//     }

//     const { firstName, lastName, email, phoneNumber } = parsed.data;

//     const member = await prisma.institutionMember.create({
//       data: {
//         firstName,
//         lastName,
//         email,
//         phoneNumber,
//         profilePhoto: profilePhotoUrl,
//       },
//     });

//     return reply.code(201).send({
//       data: {
//         ...member,
//         id: Number(member.id),
//       },
//       message: 'Member created successfully',
//     });
//   } catch (err) {
//     request.log.error(err, 'createInstitutionMember failed');
//     return reply.code(500).send({ error: 'Internal server error' });
//   }
// }

// async function hashPassword(password: string): Promise<string> {
//   // TODO: Implement proper bcrypt hashing
//   const bcrypt = require('bcrypt');
//   return bcrypt.hash(password, 10);
// }

// // createUserPayload
// interface CreateUserPayload {
//   email: string;
//   firstName: string;
//   lastName: string;
//   password?: string;
//   roleId: number;
//   permissionIds: number[]; // Selected permissions for this user
//   createdBy: number; // Admin user creating this user
// }

// // createUserResponse
// interface CreateUserResponse {
//   userId: number;
//   email: string;
//   roleId: number;
//   assignedPermissions: number;
//   message: string;
// }

// // newly added create user function
// export async function createUserWithPermissions(
//   institutionId: number,
//   payload: CreateUserPayload
// ): Promise<CreateUserResponse> {
//   try {
//     // Validate role belongs to institution
//     const role = await prisma.roles.findFirst({
//       where: {
//         id: payload.roleId,
//         institution_id: institutionId,
//       },
//       include: {
//         role_hierarchy: true,
//       },
//     });

//     if (!role) {
//       throw new Error('Invalid role for this institution');
//     }

//     // Get institution's plan
//     const institution = await prisma.institutions.findUnique({
//       where: { id: institutionId },
//       include: {
//         plans: true,
//       },
//     });

//     if (!institution?.plans) {
//       throw new Error('Institution has no plan');
//     }

//     // Get all available permissions for this institution's plan
//     const availablePermissions = await getAvailablePermissionsForPlan(
//       institution.plans.code
//     );

//     // Validate all selected permissions are available in plan
//     const invalidPermissions = payload.permissionIds.filter(
//       (permId) => !availablePermissions.includes(permId)
//     );

//     if (invalidPermissions.length > 0) {
//       throw new Error(
//         `Permissions not available in plan: ${invalidPermissions.join(', ')}`
//       );
//     }

//     // Get default role permissions
//     const defaultPermissions = await getRoleDefaultPermissions(payload.roleId);

//     // Calculate permissions to grant and revoke
//     const permissionsToGrant = payload.permissionIds.filter(
//       (permId) => !defaultPermissions.includes(permId)
//     );

//     const permissionsToRevoke = defaultPermissions.filter(
//       (permId) => !payload.permissionIds.includes(permId)
//     );

//     // Start transaction
//     const result = await prisma.$transaction(async (tx) => {
//       // 1. Create user
//       const user = await tx.users.create({
//         data: {
//           institution_id: institutionId,
//           email: payload.email,
//           first_name: payload.firstName,
//           last_name: payload.lastName,
//           password_hash: payload.password
//             ? await hashPassword(payload.password)
//             : null,
//           email_verified: false,
//           must_change_password: !payload.password, // If no password, must set one
//           status: 'active',
//           updated_at: new Date(),
//         },
//       });

//       // 2. Assign role to user
//       await tx.user_roles.create({
//         data: {
//           user_id: user.id,
//           role_id: payload.roleId,
//           assigned_by: payload.createdBy,
//           assigned_at: new Date(),
//         },
//       });

//       // 3. Create permission overrides (grants)
//       if (permissionsToGrant.length > 0) {
//         await tx.user_permission_overrides.createMany({
//           data: permissionsToGrant.map((permId) => ({
//             user_id: user.id,
//             permission_id: permId,
//             override_type: 'grant',
//             reason: 'Additional permission granted during user creation',
//             granted_by: payload.createdBy,
//             granted_at: new Date(),
//           })),
//         });
//       }

//       // 4. Create permission overrides (revokes)
//       if (permissionsToRevoke.length > 0) {
//         await tx.user_permission_overrides.createMany({
//           data: permissionsToRevoke.map((permId) => ({
//             user_id: user.id,
//             permission_id: permId,
//             override_type: 'revoke',
//             reason: 'Permission revoked during user creation',
//             granted_by: payload.createdBy,
//             granted_at: new Date(),
//           })),
//         });
//       }

//       return {
//         userId: Number(user.id),
//         email: user.email,
//         roleId: payload.roleId,
//         assignedPermissions: payload.permissionIds.length,
//       };
//     });

//     return {
//       ...result,
//       message: 'User created successfully',
//     };
//   } catch (error) {
//     console.error('Error creating user:', error);
//     throw error;
//   }
// }

/**
 * Get all data needed for user creation form, newlyadded
 */
// export async function getUserCreationFormData(institutionId: number) {
//   try {
//     const [hierarchies, modules] = await Promise.all([
//       getRolesHierarchy(institutionId),
//       getAvailableModulesHandler(institutionId),
//     ]);

//     return {
//       hierarchies,
//       modules,
//     };
//   } catch (error) {
//     console.error('Error fetching user creation form data:', error);
//     throw new Error('Failed to fetch form data');
//   }
// }

//  * @param roleId - The role ID
//  * @returns List of default permission IDs for this role
//  */
// export async function getRoleDefaultPermissions(
//   roleId: number
// ): Promise<number[]> {
//   try {
//     const rolePermissions = await prisma.role_permissions.findMany({
//       where: {
//         role_id: roleId,
//       },
//       select: {
//         permission_id: true,
//       },
//     });

//     return rolePermissions.map((rp) => rp.permission_id);
//   } catch (error) {
//     console.error('Error fetching role default permissions:', error);
//     throw new Error('Failed to fetch role permissions');
//   }
// }

// ------------- create flexible user ------------------------//
// import { PrismaClient } from '@prisma/client';

// const prisma = new PrismaClient();

// // ============================================
// // ENHANCED USER CREATION FLOW
// // Handles cases where roles don't have permissions configured
// // ============================================

// interface FlexibleUserCreationPayload {
//   email: string;
//   firstName: string;
//   lastName: string;
//   password?: string;

//   // Role assignment (optional if directly assigning permissions)
//   roleId?: number;

//   // Direct permission assignment
//   // This works even if role has no permissions configured
//   permissionIds: number[];

//   // Direct module assignment (optional - inferred from permissions)
//   moduleIds?: number[];

//   // Creator info
//   createdBy: number;
// }

// interface UserCreationResult {
//   userId: number;
//   email: string;
//   roleId: number | null;
//   roleName: string | null;
//   assignedPermissions: number;
//   assignedModules: string[];
//   assignedFeatures: string[];
//   message: string;
//   warnings: string[];
// }

// ============================================
// MAIN API: CREATE USER WITH FLEXIBLE PERMISSIONS
// ============================================

/**
 * Create user with flexible permission assignment
 * Works even when:
 * - Role has no permissions configured
 * - Same role but different permissions for different users
 * - No role assigned (direct permission assignment)
 * 
//  * @param institutionId - Institution ID
//  * @param payload - User creation data
//  * @returns Creation result with details
//  */
// export async function createUserFlexible(
//   institutionId: number,
//   payload: FlexibleUserCreationPayload
// ): Promise<UserCreationResult> {
//   try {
//     const warnings: string[] = [];

//     // 1. Get institution's plan to validate permissions
//     const institution = await prisma.institutions.findUnique({
//       where: { id: institutionId },
//       include: { plans: true },
//     });

//     if (!institution?.plans) {
//       throw new Error('Institution has no plan assigned');
//     }

//     const planCode = institution.plans.code;

//     // 2. Validate all permissions are available in plan
//     const availablePermissions = await getAvailablePermissionsForPlan(planCode);
//     const invalidPermissions = payload.permissionIds.filter(
//       (pid) => !availablePermissions.includes(pid)
//     );

//     if (invalidPermissions.length > 0) {
//       throw new Error(
//         `These permissions are not available in your plan: ${invalidPermissions.join(', ')}`
//       );
//     }

//     // 3. Validate role (if provided)
//     let role = null;
//     let rolePermissions: number[] = [];

//     if (payload.roleId) {
//       role = await prisma.roles.findFirst({
//         where: {
//           id: payload.roleId,
//           institution_id: institutionId,
//         },
//         include: {
//           role_hierarchy: true,
//         },
//       });

//       if (!role) {
//         throw new Error('Invalid role for this institution');
//       }

//       // Get role's default permissions (might be empty!)
//       const rolePerms = await prisma.role_permissions.findMany({
//         where: { role_id: payload.roleId },
//         select: { permission_id: true },
//       });

//       rolePermissions = rolePerms.map((rp) => rp.permission_id);

//       // Warning if role has no permissions configured
//       if (rolePermissions.length === 0) {
//         warnings.push(
//           `Role "${role.name}" has no default permissions configured. All permissions will be assigned as overrides.`
//         );
//       }
//     } else {
//       warnings.push(
//         'No role assigned. User will have direct permission assignments only.'
//       );
//     }

//     // 4. Calculate permission differences
//     const permissionsToGrant = payload.permissionIds.filter(
//       (pid) => !rolePermissions.includes(pid)
//     );

//     const permissionsToRevoke = rolePermissions.filter(
//       (pid) => !payload.permissionIds.includes(pid)
//     );

//     // 5. Get module and feature info for the assigned permissions
//     const permissionDetails = await prisma.permissions.findMany({
//       where: {
//         id: { in: payload.permissionIds },
//       },
//       include: {
//         features: {
//           include: {
//             modules: true,
//           },
//         },
//       },
//     });

//     const moduleSet = new Set<string>();
//     const featureSet = new Set<string>();

//     permissionDetails.forEach((p) => {
//       if (p.features?.modules) {
//         moduleSet.add(p.features.modules.code);
//       }
//       if (p.features) {
//         featureSet.add(p.features.code);
//       }
//     });

//     // 6. Create user in transaction
//     const result = await prisma.$transaction(async (tx) => {
//       // Create user
//       const user = await tx.users.create({
//         data: {
//           institution_id: institutionId,
//           email: payload.email,
//           first_name: payload.firstName,
//           last_name: payload.lastName,
//           password_hash: payload.password
//             ? await hashPassword(payload.password)
//             : null,
//           email_verified: false,
//           must_change_password: !payload.password,
//           status: 'active',
//           updated_at: new Date(),
//         },
//       });

//       // Assign role (if provided)
//       if (payload.roleId) {
//         await tx.user_roles.create({
//           data: {
//             user_id: user.id,
//             role_id: payload.roleId,
//             assigned_by: payload.createdBy,
//             assigned_at: new Date(),
//           },
//         });
//       }

//       // Create permission grants (permissions not in role)
//       if (permissionsToGrant.length > 0) {
//         await tx.user_permission_overrides.createMany({
//           data: permissionsToGrant.map((pid) => ({
//             user_id: user.id,
//             permission_id: pid,
//             override_type: 'grant',
//             reason: rolePermissions.length === 0
//               ? 'Direct permission assignment (role has no defaults)'
//               : 'Additional permission granted during user creation',
//             granted_by: payload.createdBy,
//             granted_at: new Date(),
//           })),
//         });
//       }

//       // Create permission revokes (permissions in role but not selected)
//       if (permissionsToRevoke.length > 0) {
//         await tx.user_permission_overrides.createMany({
//           data: permissionsToRevoke.map((pid) => ({
//             user_id: user.id,
//             permission_id: pid,
//             override_type: 'revoke',
//             reason: 'Permission revoked during user creation',
//             granted_by: payload.createdBy,
//             granted_at: new Date(),
//           })),
//         });
//       }

//       return {
//         userId: Number(user.id),
//         email: user.email,
//       };
//     });

//     return {
//       userId: result.userId,
//       email: result.email,
//       roleId: payload.roleId || null,
//       roleName: role?.name || null,
//       assignedPermissions: payload.permissionIds.length,
//       assignedModules: Array.from(moduleSet),
//       assignedFeatures: Array.from(featureSet),
//       message: 'User created successfully',
//       warnings,
//     };
//   } catch (error) {
//     console.error('Error creating user:', error);
//     throw error;
//   }
// }

// ============================================
// API: GET USER'S ASSIGNED MODULES & PERMISSIONS
// ============================================

// /**
//  * Get summary of what modules, features, and permissions are assigned to a user
//  * This answers: "What is this user allowed to access?"
//  *
//  * @param userId - User ID
//  * @returns Summary of user's access
//  */
// export async function getUserAccessSummary(userId: number) {
//   try {
//     // Get user with role info
//     const user = await prisma.users.findUnique({
//       where: { id: userId },
//       select: {
//         id: true,
//         email: true,
//         first_name: true,
//         last_name: true,
//         institution_id: true,
//         institutions: {
//           select: {
//             name: true,
//             plans: {
//               select: {
//                 name: true,
//                 code: true,
//               },
//             },
//           },
//         },
//       },
//     });

//     if (!user) {
//       throw new Error('User not found');
//     }

//     // Get user's roles
//     const userRoles = await prisma.user_roles.findMany({
//       where: { user_id: userId },
//       include: {
//         roles: {
//           include: {
//             role_hierarchy: true,
//           },
//         },
//       },
//     });

//     // Get effective permissions
//     const permissions = await getUserEffectivePermissions(userId);

//     // Group permissions by module and feature
//     const moduleMap = new Map<string, {
//       id: number;
//       code: string;
//       name: string;
//       features: Map<string, {
//         id: number;
//         code: string;
//         name: string;
//         permissions: typeof permissions;
//       }>;
//     }>();

//     for (const perm of permissions) {
//       // Get full permission details
//       const permDetail = await prisma.permissions.findUnique({
//         where: { id: perm.id },
//         include: {
//           features: {
//             include: {
//               modules: true,
//             },
//           },
//         },
//       });

//       if (!permDetail?.features?.modules) continue;

//       const module = permDetail.features.modules;
//       const feature = permDetail.features;

//       // Add module if not exists
//       if (!moduleMap.has(module.code)) {
//         moduleMap.set(module.code, {
//           id: module.id,
//           code: module.code,
//           name: module.name,
//           features: new Map(),
//         });
//       }

//       const moduleEntry = moduleMap.get(module.code)!;

//       // Add feature if not exists
//       if (!moduleEntry.features.has(feature.code)) {
//         moduleEntry.features.set(feature.code, {
//           id: feature.id,
//           code: feature.code,
//           name: feature.name,
//           permissions: [],
//         });
//       }

//       // Add permission
//       moduleEntry.features.get(feature.code)!.permissions.push(perm);
//     }

//     // Convert maps to arrays
//     const modules = Array.from(moduleMap.values()).map((m) => ({
//       ...m,
//       features: Array.from(m.features.values()),
//     }));

//     return {
//       user: {
//         id: Number(user.id),
//         email: user.email,
//         firstName: user.first_name,
//         lastName: user.last_name,
//         institutionName: user.institutions?.name,
//         planName: user.institutions?.plans?.name,
//         planCode: user.institutions?.plans?.code,
//       },
//       roles: userRoles.map((ur) => ({
//         id: ur.roles.id,
//         name: ur.roles.name,
//         hierarchyName: ur.roles.role_hierarchy?.name,
//         hierarchyLevel: ur.roles.role_hierarchy?.level,
//       })),
//       summary: {
//         totalPermissions: permissions.length,
//         totalModules: modules.length,
//         totalFeatures: modules.reduce((sum, m) => sum + m.features.length, 0),
//         permissionsFromRole: permissions.filter((p) => p.source === 'role').length,
//         permissionsFromOverride: permissions.filter((p) => p.source === 'override').length,
//       },
//       modules,
//     };
//   } catch (error) {
//     console.error('Error getting user access summary:', error);
//     throw new Error('Failed to get user access summary');
//   }
// }

// ============================================
// API: COMPARE TWO USERS' ACCESS
// ============================================

/**
//  * Compare access between two users with the same role
//  * This answers: "Why do these two users with same role have different access?"
//  * 
//  * @param userId1 - First user ID
//  * @param userId2 - Second user ID
//  * @returns Comparison of their access
//  */
// export async function compareUserAccess(userId1: number, userId2: number) {
//   try {
//     const [user1Perms, user2Perms] = await Promise.all([
//       getUserEffectivePermissions(userId1),
//       getUserEffectivePermissions(userId2),
//     ]);

//     const perms1Set = new Set(user1Perms.map((p) => p.code));
//     const perms2Set = new Set(user2Perms.map((p) => p.code));

//     const onlyUser1 = user1Perms.filter((p) => !perms2Set.has(p.code));
//     const onlyUser2 = user2Perms.filter((p) => !perms1Set.has(p.code));
//     const common = user1Perms.filter((p) => perms2Set.has(p.code));

//     return {
//       user1: {
//         total: user1Perms.length,
//         fromRole: user1Perms.filter((p) => p.source === 'role').length,
//         fromOverride: user1Perms.filter((p) => p.source === 'override').length,
//       },
//       user2: {
//         total: user2Perms.length,
//         fromRole: user2Perms.filter((p) => p.source === 'role').length,
//         fromOverride: user2Perms.filter((p) => p.source === 'override').length,
//       },
//       comparison: {
//         common: common.length,
//         onlyUser1: onlyUser1.length,
//         onlyUser2: onlyUser2.length,
//       },
//       details: {
//         commonPermissions: common.map((p) => p.code),
//         onlyInUser1: onlyUser1.map((p) => ({
//           code: p.code,
//           name: p.name,
//           source: p.source,
//         })),
//         onlyInUser2: onlyUser2.map((p) => ({
//           code: p.code,
//           name: p.name,
//           source: p.source,
//         })),
//       },
//     };
//   } catch (error) {
//     console.error('Error comparing user access:', error);
//     throw new Error('Failed to compare user access');
//   }
// }

// ============================================
// HELPER FUNCTIONS
// ============================================

// async function getUserEffectivePermissions(userId: number) {
//   // Implementation from previous artifact
//   // Returns PermissionInfo[]
//   return []; // Placeholder
// }

// async function getAvailablePermissionsForPlan(planCode: string) {
//   const planFeatures = await prisma.plan_features.findMany({
//     where: { plan_code: planCode, included: true },
//     select: { feature_code: true },
//   });

//   const featureCodes = planFeatures.map((pf) => pf.feature_code);

//   const permissions = await prisma.permissions.findMany({
//     where: { feature_code: { in: featureCodes } },
//     select: { id: true },
//   });

//   return permissions.map((p) => p.id);
// }

// async function hashPassword(password: string): Promise<string> {
//   const bcrypt = require('bcrypt');
//   return bcrypt.hash(password, 10);
// }

// ============================================
// EXPRESS ROUTES
// ============================================

/*
import express from 'express';

const router = express.Router();

// Create user with flexible permissions
router.post('/api/institutions/:institutionId/users/flexible', async (req, res) => {
  try {
    const institutionId = parseInt(req.params.institutionId);
    const result = await createUserFlexible(institutionId, {
      ...req.body,
      createdBy: req.user.id, // From auth middleware
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get user access summary
router.get('/api/users/:userId/access-summary', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const summary = await getUserAccessSummary(userId);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Compare two users
router.get('/api/users/compare/:userId1/:userId2', async (req, res) => {
  try {
    const userId1 = parseInt(req.params.userId1);
    const userId2 = parseInt(req.params.userId2);
    const comparison = await compareUserAccess(userId1, userId2);
    res.json(comparison);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
*/

// ============================================
// USAGE SCENARIOS
// ============================================

/*
SCENARIO 1: Role has no permissions configured
-----------------------------------------------
Admin creates Faculty role but forgets to assign permissions.
Later, creates a user:

const result = await createUserFlexible(1, {
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
  roleId: 5, // Faculty role (has 0 permissions)
  permissionIds: [1, 2, 3, 4], // Directly assign these
  createdBy: 100,
});

// Result:
// - User created with Faculty role
// - All 4 permissions assigned as "grants" (overrides)
// - Warning: "Role has no default permissions"


SCENARIO 2: Same role, different permissions
----------------------------------------------
Two Faculty members, same role, different access:

// Faculty Member 1 - Can view and create students
await createUserFlexible(1, {
  email: 'faculty1@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  roleId: 5, // Faculty role
  permissionIds: [1, 2], // student:view, student:create
  createdBy: 100,
});

// Faculty Member 2 - Can view, create, and delete students
await createUserFlexible(1, {
  email: 'faculty2@example.com',
  firstName: 'Bob',
  lastName: 'Jones',
  roleId: 5, // Same Faculty role
  permissionIds: [1, 2, 3], // student:view, student:create, student:delete
  createdBy: 100,
});

// Both have Faculty role, but different effective permissions!


SCENARIO 3: Check what user can access
----------------------------------------
// Admin wants to see what Faculty Member 1 can do:

const summary = await getUserAccessSummary(user1Id);

// Returns:
{
  user: { email: 'faculty1@example.com', ... },
  roles: [{ name: 'Faculty', hierarchyName: 'Faculty' }],
  summary: {
    totalPermissions: 2,
    totalModules: 1,
    totalFeatures: 1,
    permissionsFromRole: 0,
    permissionsFromOverride: 2
  },
  modules: [
    {
      code: 'student_management',
      name: 'Student Management',
      features: [
        {
          code: 'student_list',
          name: 'Student List',
          permissions: [
            { code: 'student:view', name: 'View Students', source: 'override' },
            { code: 'student:create', name: 'Create Students', source: 'override' }
          ]
        }
      ]
    }
  ]
}


SCENARIO 4: Compare why two users have different access
---------------------------------------------------------
// Admin confused why two Faculty members can't both delete students:

const comparison = await compareUserAccess(user1Id, user2Id);

// Returns:
{
  user1: { total: 2, fromRole: 0, fromOverride: 2 },
  user2: { total: 3, fromRole: 0, fromOverride: 3 },
  comparison: {
    common: 2,
    onlyUser1: 0,
    onlyUser2: 1
  },
  details: {
    commonPermissions: ['student:view', 'student:create'],
    onlyInUser1: [],
    onlyInUser2: [
      { code: 'student:delete', name: 'Delete Students', source: 'override' }
    ]
  }
}

// Clear answer: User 2 has extra "student:delete" permission!
*/

// export default {
//   createUserFlexible,
//   getUserAccessSummary,
//   compareUserAccess,
// };

// ---- create flexible user code ends here ----------------//
