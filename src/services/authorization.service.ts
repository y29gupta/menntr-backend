/**
 * Resolves permission codes for a user from role_permissions only.
 * Does NOT apply user_permission_overrides or institution scoping.
 *
 * For auth context (login, me/context, JWT) use resolveAccessContext from
 * auth/permission.resolver instead, which applies role_permissions +
 * user_permission_overrides and filters by institution.
 */
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
