import { createDefaultRoles } from "./role.service";

export async function provisionInstitution(
  prisma: any,
  institutionId: number,
  planId: number | null
) {
  // 1️⃣ Enable plan modules
  if (planId) {
    const modules = await prisma.planModule.findMany({
      where: { planId, included: true },
    });

    if (modules.length) {
      await prisma.institutionModule.createMany({
        data: modules.map((m: any) => ({
          institutionId,
          moduleId: m.moduleId,
          enabled: true,
        })),
        skipDuplicates: true,
      });
    }
  }

  // 2️⃣ DO NOTHING ABOUT ROLES ✅
  // Roles will be created later by Institution Admin
}

