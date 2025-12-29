
export class PlanService {
  static async createPlan(prisma: any, data: any) {
    return prisma.plan.create({
      data: {
        code: data.code,
        name: data.name,
        priceMonthly: data.priceMonthly,
        priceYearly: data.priceYearly,
        maxStudents: data.maxStudents,
        isPublic: data.isPublic ?? true,
        description: data.description,
      },
    });
  }
}

export async function attachModulesToPlan(
  prisma:any,
  planId: number,
  moduleIds: number[]
) {
  return prisma.planModule.createMany({
    data: moduleIds.map((moduleId) => ({
      planId,
      moduleId,
      included: true,
    })),
    skipDuplicates: true,
  });
}

export async function attachFeaturesToPlan(
  prisma:any,
  planId: number,
  featureIds: number[]
) {
  return prisma.planFeature.createMany({
    data: featureIds.map((featureId) => ({
      planId,
      featureId,
      included: true,
    })),
    skipDuplicates: true,
  });
}
