export async function resolveUserPermissions(prisma:any, userId:any) {
  const permissions = await prisma.permission.findMany({
    where: {
      roles: {
        some: {
          role: {
            users: {
              some: { userId },
            },
          },
        },
      },
    },
    select: { permissionCode: true },
  });

  return permissions.map((p:any) => p.permissionCode);
}
