// services/permission.service.ts
export class PermissionService {
    static async createPermission(prisma: any, data: any) {
        return prisma.permission.create({
            data: {
                code: data.code,
                name: data.name,
                featureId: data.featureId,
                actionType: data.actionType,
                description: data.description,
            },
        });
    }
}