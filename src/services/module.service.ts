// services/module.service.ts
export class ModuleService {
  static async createModule(prisma:any, data:any) {
    return prisma.module.create({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        isCore: data.isCore ?? false,
        isSystemModule: data.isSystemModule ?? false,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }
}
