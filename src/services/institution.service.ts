// import { createDefaultRoles } from "./role.service";

export async function provisionInstitution(
  prisma: any,
  institution_id: number,
  plan_id: number | null
) {
  // 1️⃣ Enable plan modules
  if (plan_id) {
    const modules = await prisma.plan_modules.findMany({
      where: { plan_id, included: true },
    });

    if (modules.length) {
      await prisma.institution_modules.createMany({
        data: modules.map((m: any) => ({
          institution_id,
          module_id: m.module_id,
          enabled: true,
        })),
        skipDuplicates: true,
      });
    }
  }

  // 2️⃣ DO NOTHING ABOUT ROLES ✅
  // Roles will be created later by Institution Admin
}

