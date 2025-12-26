import { PrismaClient } from "@prisma/client";

export async function createDefaultRoles(prisma:any, institutionId: number) {
  const roles = ['Institution Admin', 'Principal', 'HOD', 'Faculty'];

  await prisma.role.createMany({
    data: roles.map((name) => ({
      name,
      institutionId,
    })),
  });
}

export async function assignPermissionsToRole(
  prisma:any,
  roleId:any,
  permissionIds:any,
  institutionId:any
) {
  const allowedPermissions = await prisma.permission.findMany({
    where: {
      id: { in: permissionIds },
      feature: {
        planFeatures: {
          some: {
            plan: {
              institutions: {
                some: { id: institutionId },
              },
            },
            included: true,
          },
        },
      },
    },
  });

  if (allowedPermissions.length !== permissionIds.length) {
    throw new Error('Permission not allowed by plan');
  }

  return prisma.rolePermission.createMany({
    data: allowedPermissions.map((p:any) => ({
      roleId,
      permissionId: p.id,
    })),
  });
}
export async function getInstitutionAdminRole(
  prisma: PrismaClient,
  institutionId: number
) {
  return prisma.role.findFirst({
    where: {
      institutionId,
      parentId: null,
      isSystemRole: false,
    },
  });
}
