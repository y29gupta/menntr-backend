
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

export async function getAllPlans(prisma: any) {
  const plans = await prisma.plans.findMany({
    where: {
      is_public: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      price_monthly: true,
      price_yearly: true,
      max_students: true,
      max_admins: true,
      storage_gb: true,
      ai_queries_per_month: true,
      description: true,
    },
    orderBy: {
      id: 'asc',
    },
  });

  // For each plan, fetch modules and features
  const plansWithDetails = await Promise.all(
    plans.map(async (plan: any) => {
      // Get modules for this plan (using plan_id)
      const planModules = await prisma.plan_modules.findMany({
        where: {
          plan_id: plan.id,
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
              sort_order: true,
            },
          },
        },
        orderBy: {
          module: {
            sort_order: 'asc',
          },
        },
      });

      // Get features for this plan (using plan_code)
      const planFeatures = await prisma.plan_features.findMany({
        where: {
          plan_code: plan.code,
          included: true,
        },
        select: {
          feature_code: true,
          usage_limit: true,
          feature: {
            select: {
              id: true,
              code: true,
              name: true,
              description: true,
              module_id: true,
            },
          },
        },
      });

      // Group features by module
      const modulesWithFeatures = planModules.map((pm: any) => {
        const moduleFeatures = planFeatures
          .filter((pf: any) => pf.feature && pf.feature.module_id === pm.module.id)
          .map((pf: any) => ({
            id: pf.feature.id,
            code: pf.feature.code,
            name: pf.feature.name,
            description: pf.feature.description,
            usage_limit: pf.usage_limit,
          }));

        return {
          ...pm.module,
          features: moduleFeatures,
        };
      });

      return {
        ...plan,
        modules: modulesWithFeatures,
      };
    })
  );

  return plansWithDetails;
}