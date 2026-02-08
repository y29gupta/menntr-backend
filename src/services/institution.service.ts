// Helper function to assign permissions to a role based on plan and hierarchy
async function assignPermissionsToRole(
  tx: any,
  roleId: number,
  planCode: string | null,
  roleHierarchyId: number
) {
  if (!planCode) {
    // If no plan, skip permission assignment
    return;
  }

  // Get permissions from plan_role_permissions based on plan_code and role_hierarchy_id
  const planRolePermissions = await tx.plan_role_permissions.findMany({
    where: {
      plan_code: planCode,
      role_hierarchy_id: roleHierarchyId,
    },
    select: {
      permission_id: true,
    },
  });

  if (planRolePermissions.length > 0) {
    // Insert permissions into role_permissions table
    await tx.role_permissions.createMany({
      data: planRolePermissions.map((prp: any) => ({
        role_id: roleId,
        permission_id: prp.permission_id,
      })),
      skipDuplicates: true,
    });
  }
}

export async function createDefaultRoles(
  prisma: any,
  institution_id: number,
  plan_code: string | null
) {
  // Create default roles in a transaction
  return await prisma.$transaction(async (tx: any) => {
    // 1️⃣ Create Institution Admin (Level 1, no parent)
    const institutionAdmin = await tx.roles.create({
      data: {
        name: 'Institution Admin',
        description: 'Full control over the institution',
        institution_id,
        role_hierarchy_id: 1,
        parent_id: null,
        is_system_role: false,
      },
    });

    // Assign permissions to Institution Admin
    await assignPermissionsToRole(tx, institutionAdmin.id, plan_code, 1);

    // 2️⃣ Create Category Admin - Engineering (Level 2, parent: Institution Admin)
    const categoryAdminEngineering = await tx.roles.create({
      data: {
        name: 'Category Admin - Engineering',
        description: 'Manages Engineering category',
        institution_id,
        role_hierarchy_id: 2,
        parent_id: institutionAdmin.id,
        is_system_role: false,
      },
    });

    // Assign permissions to Category Admin
    await assignPermissionsToRole(tx, categoryAdminEngineering.id, plan_code, 2);

    // 3️⃣ Create HOD - Computer Science (Level 3, parent: Category Admin - Engineering)
    const hodComputerScience = await tx.roles.create({
      data: {
        name: 'HOD - Computer Science',
        description: 'Head of CS Department',
        institution_id,
        role_hierarchy_id: 3,
        parent_id: categoryAdminEngineering.id,
        is_system_role: false,
      },
    });

    // Assign permissions to HOD - Computer Science
    await assignPermissionsToRole(tx, hodComputerScience.id, plan_code, 3);

    // 4️⃣ Create HOD - Mechanical (Level 3, parent: Category Admin - Engineering)
    const hodMechanical = await tx.roles.create({
      data: {
        name: 'HOD - Mechanical',
        description: 'Head of Mechanical Dept',
        institution_id,
        role_hierarchy_id: 3,
        parent_id: categoryAdminEngineering.id,
        is_system_role: false,
      },
    });

    // Assign permissions to HOD - Mechanical
    await assignPermissionsToRole(tx, hodMechanical.id, plan_code, 3);

    // 5️⃣ Create Faculty - CS (Level 4, parent: HOD - Computer Science)
    const facultyCS = await tx.roles.create({
      data: {
        name: 'Faculty - CS',
        description: 'CS Teaching Faculty',
        institution_id,
        role_hierarchy_id: 4,
        parent_id: hodComputerScience.id,
        is_system_role: false,
      },
    });

    // Assign permissions to Faculty - CS
    await assignPermissionsToRole(tx, facultyCS.id, plan_code, 4);

    // 6️⃣ Create Faculty - Mechanical (Level 4, parent: HOD - Mechanical)
    const facultyMechanical = await tx.roles.create({
      data: {
        name: 'Faculty - Mechanical',
        description: 'Mechanical Faculty',
        institution_id,
        role_hierarchy_id: 4,
        parent_id: hodMechanical.id,
        is_system_role: false,
      },
    });

    // Assign permissions to Faculty - Mechanical
    await assignPermissionsToRole(tx, facultyMechanical.id, plan_code, 4);

    // 7️⃣ Create Student (Level 5, parent: Institution Admin)
    const student = await tx.roles.create({
      data: {
        name: 'Student',
        description: 'Regular student user',
        institution_id,
        role_hierarchy_id: 5,
        parent_id: institutionAdmin.id,
        is_system_role: false,
      },
    });

    // Assign permissions to Student
    await assignPermissionsToRole(tx, student.id, plan_code, 5);

    return {
      institutionAdminId: institutionAdmin.id,
    };
  });
}

export async function provisionInstitution(
  prisma: any,
  institution_id: number,
  plan_id: number | null
) {
  // 1️⃣ Get plan code if plan_id exists
  let plan_code: string | null = null;
  if (plan_id) {
    const plan = await prisma.plans.findUnique({
      where: { id: plan_id },
      select: { code: true },
    });
    plan_code = plan?.code || null;
  }

  // 2️⃣ Enable plan modules
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

  // 3️⃣ Create default roles for the institution with permissions
  await createDefaultRoles(prisma, institution_id, plan_code);
}

