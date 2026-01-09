export async function resolveUserPermissions(
  prisma: any,
  userId: number
) {
  const permissions = await prisma.permissions.findMany({
    where: {
      role_permissions: {
        some: {
          role: {
            user_roles: {
              some: {
                user_id: userId,
              },
            },
          },
        },
      },
    },
    select: {
      permission_code: true,
    },
  });

  return permissions.map((p: any) => p.permission_code);
}
