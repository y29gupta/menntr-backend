export class FeatureService {
  static async createFeature(prisma:any, data:any) {
    return prisma.feature.create({
      data: {
        code: data.code,
        name: data.name,
        moduleId: data.moduleId,
        minPlanRequired: data.minPlanRequired,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }
}
