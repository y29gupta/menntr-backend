import { createDefaultRoles } from "./role.service";

export async function provisionInstitution(prisma:any, institutionId:any, planId:any) {
  const modules = await prisma.planModule.findMany({
    where: { planId, included: true },
  });

  await prisma.institutionModule.createMany({
    data: modules.map((m:any) => ({
      institutionId,
      moduleId: m.moduleId,
      enabled: true,
    })),
  });

  await createDefaultRoles(prisma, institutionId);
}
