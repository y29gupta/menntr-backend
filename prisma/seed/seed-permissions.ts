import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * Seed: UI-aligned RBAC (modules, features, permissions, plan_role_permissions).
 *
 * This script ensures the DB has modules/features/permissions that match the
 * frontend constants (menntr-frontend/src/app/constants/permissions.ts).
 * All operations are UPSERTs so you can run it against existing tables without
 * deleting existing data; UI-aligned rows are added or updated.
 *
 * - Modules: dashboard, organization, user-management, student-management, assessment
 * - Features and permissions: exact codes used by the UI (e.g. organization:categories:view)
 * - plan_role_permissions: template per plan × role_hierarchy for default role permissions
 * - plan_modules / plan_features: link plans to these modules and features
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('ssl') ? { rejectUnauthorized: false } : undefined,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── UI-aligned module definitions (codes must match frontend) ──

const MODULES = [
  { code: 'dashboard', name: 'Dashboard', icon: 'LayoutDashboard', category: 'core', is_core: true, sort_order: 1 },
  { code: 'organization', name: 'Organization', icon: 'Building2', category: 'admin', is_core: false, sort_order: 2 },
  { code: 'user-management', name: 'User Management', icon: 'Users', category: 'admin', is_core: false, sort_order: 3 },
  { code: 'student-management', name: 'Student Management', icon: 'GraduationCap', category: 'admin', is_core: false, sort_order: 4 },
  { code: 'assessment', name: 'Assessment', icon: 'ClipboardList', category: 'academic', is_core: false, sort_order: 5 },
];

// ── Feature → Permission mapping (permission_code must match frontend constants) ──

type PermDef = { code: string; name: string; action: string };
type FeatureDef = { code: string; name: string; permissions: PermDef[] };
type ModuleFeatures = { moduleCode: string; features: FeatureDef[] };

const MODULE_FEATURES: ModuleFeatures[] = [
  {
    moduleCode: 'dashboard',
    features: [
      {
        code: 'dashboard-view',
        name: 'Dashboard View',
        permissions: [
          { code: 'dashboard:view', name: 'View Dashboard', action: 'READ' },
        ],
      },
    ],
  },
  {
    moduleCode: 'organization',
    features: [
      {
        code: 'categories',
        name: 'Categories',
        permissions: [
          { code: 'organization:categories:view', name: 'View Categories', action: 'READ' },
          { code: 'organization:categories:create', name: 'Create Category', action: 'CREATE' },
          { code: 'organization:categories:edit', name: 'Edit Category', action: 'UPDATE' },
          { code: 'organization:categories:delete', name: 'Delete Category', action: 'DELETE' },
        ],
      },
      {
        code: 'departments',
        name: 'Departments',
        permissions: [
          { code: 'organization:departments:view', name: 'View Departments', action: 'READ' },
          { code: 'organization:departments:create', name: 'Create Department', action: 'CREATE' },
          { code: 'organization:departments:edit', name: 'Edit Department', action: 'UPDATE' },
          { code: 'organization:departments:delete', name: 'Delete Department', action: 'DELETE' },
        ],
      },
      {
        code: 'batches',
        name: 'Batches',
        permissions: [
          { code: 'organization:batches:view', name: 'View Batches', action: 'READ' },
          { code: 'organization:batches:create', name: 'Create Batch', action: 'CREATE' },
          { code: 'organization:batches:edit', name: 'Edit Batch', action: 'UPDATE' },
          { code: 'organization:batches:delete', name: 'Delete Batch', action: 'DELETE' },
        ],
      },
      {
        code: 'hierarchy',
        name: 'Role Hierarchy',
        permissions: [
          { code: 'organization:hierarchy:view', name: 'View Hierarchy', action: 'READ' },
          { code: 'organization:hierarchy:manage', name: 'Manage Hierarchy', action: 'UPDATE' },
        ],
      },
    ],
  },
  {
    moduleCode: 'user-management',
    features: [
      {
        code: 'users',
        name: 'Users',
        permissions: [
          { code: 'user-management:users:view', name: 'View Users', action: 'READ' },
          { code: 'user-management:users:create', name: 'Create User', action: 'CREATE' },
          { code: 'user-management:users:edit', name: 'Edit User', action: 'UPDATE' },
          { code: 'user-management:users:delete', name: 'Delete User', action: 'DELETE' },
          { code: 'user-management:users:bulk_upload', name: 'Bulk Upload Users', action: 'CREATE' },
        ],
      },
      {
        code: 'roles',
        name: 'Roles',
        permissions: [
          { code: 'user-management:roles:assign', name: 'Assign Roles', action: 'UPDATE' },
        ],
      },
      {
        code: 'user-permissions',
        name: 'Permissions',
        permissions: [
          { code: 'user-management:permissions:assign', name: 'Assign Permissions', action: 'UPDATE' },
        ],
      },
    ],
  },
  {
    moduleCode: 'student-management',
    features: [
      {
        code: 'students',
        name: 'Students',
        permissions: [
          { code: 'student-management:students:view', name: 'View Students', action: 'READ' },
          { code: 'student-management:students:create', name: 'Create Student', action: 'CREATE' },
          { code: 'student-management:students:edit', name: 'Edit Student', action: 'UPDATE' },
          { code: 'student-management:students:delete', name: 'Delete Student', action: 'DELETE' },
          { code: 'student-management:students:bulk_upload', name: 'Bulk Upload Students', action: 'CREATE' },
        ],
      },
      {
        code: 'student-performance',
        name: 'Student Performance',
        permissions: [
          { code: 'student-management:performance:view', name: 'View Student Performance', action: 'READ' },
        ],
      },
    ],
  },
  {
    moduleCode: 'assessment',
    features: [
      {
        code: 'assessments',
        name: 'Assessments',
        permissions: [
          { code: 'assessment:assessments:view', name: 'View Assessments', action: 'READ' },
          { code: 'assessment:assessments:create', name: 'Create Assessment', action: 'CREATE' },
          { code: 'assessment:assessments:edit', name: 'Edit Assessment', action: 'UPDATE' },
          { code: 'assessment:assessments:delete', name: 'Delete Assessment', action: 'DELETE' },
          { code: 'assessment:assessments:publish', name: 'Publish Assessment', action: 'UPDATE' },
        ],
      },
      {
        code: 'assessment-performance',
        name: 'Assessment Performance',
        permissions: [
          { code: 'assessment:performance:view', name: 'View Assessment Performance', action: 'READ' },
        ],
      },
      {
        code: 'questions',
        name: 'Questions',
        permissions: [
          { code: 'assessment:questions:manage', name: 'Manage Questions', action: 'CREATE' },
        ],
      },
    ],
  },
];

// ── Role hierarchy level → default permission codes (for plan_role_permissions) ──
// Level 1 = Institution Admin, 2 = Category Admin, 3 = Department Admin, 4 = Faculty

const ROLE_DEFAULT_PERMISSIONS: Record<number, string[]> = {
  1: [], // Filled at runtime with ALL UI permission codes
  2: [
    'dashboard:view',
    'organization:categories:view',
    'organization:departments:view',
    'organization:batches:view',
    'organization:hierarchy:view',
    'student-management:students:view',
    'student-management:students:create',
    'student-management:students:edit',
    'student-management:students:delete',
    'student-management:students:bulk_upload',
    'student-management:performance:view',
    'assessment:assessments:view',
    'assessment:assessments:create',
    'assessment:assessments:edit',
    'assessment:assessments:delete',
    'assessment:assessments:publish',
    'assessment:performance:view',
    'assessment:questions:manage',
  ],
  3: [
    'dashboard:view',
    'student-management:students:view',
    'student-management:performance:view',
    'assessment:assessments:view',
    'assessment:performance:view',
  ],
  4: [
    'dashboard:view',
    'assessment:assessments:view',
    'assessment:performance:view',
  ],
};

/** Sync PostgreSQL sequences to max(id) so new inserts don't hit unique constraint on id (e.g. after manual/data import). */
async function syncSequences() {
  const tables = ['modules', 'features', 'permissions'] as const;
  for (const table of tables) {
    await pool.query(`
      SELECT setval(
        pg_get_serial_sequence('${table}', 'id'),
        COALESCE((SELECT MAX(id) FROM "${table}"), 1)
      );
    `);
  }
  console.log('  🔄 Synced id sequences for modules, features, permissions\n');
}

async function main() {
  console.log('🔧 Seeding UI-aligned modules, features, permissions (upsert into existing tables)...\n');

  await syncSequences();

  // ── 1. Upsert UI-aligned modules ──
  const seededModuleCodes = MODULES.map((m) => m.code);
  const moduleIdByCode = new Map<string, number>();

  for (const mod of MODULES) {
    const created = await prisma.modules.upsert({
      where: { code: mod.code },
      update: {
        name: mod.name,
        icon: mod.icon,
        category: mod.category,
        is_core: mod.is_core,
        sort_order: mod.sort_order,
      },
      create: {
        code: mod.code,
        name: mod.name,
        description: null,
        icon: mod.icon,
        category: mod.category,
        is_core: mod.is_core,
        is_system_module: false,
        sort_order: mod.sort_order,
      },
    });
    moduleIdByCode.set(created.code, created.id);
    console.log(`  ✅ Module: ${mod.code} (id: ${created.id})`);
  }

  // ── 2. Upsert features and permissions (UI permission codes) ──
  const allPermissionCodes: string[] = [];
  const seededFeatureCodes: string[] = [];

  for (const moduleDef of MODULE_FEATURES) {
    const moduleId = moduleIdByCode.get(moduleDef.moduleCode);
    if (!moduleId) {
      console.warn(`  ⚠️ Module not found: ${moduleDef.moduleCode}, skipping features`);
      continue;
    }

    for (const featureDef of moduleDef.features) {
      const feature = await prisma.features.upsert({
        where: { code: featureDef.code },
        update: {
          name: featureDef.name,
          module_id: moduleId,
        },
        create: {
          code: featureDef.code,
          name: featureDef.name,
          module_id: moduleId,
        },
      });
      seededFeatureCodes.push(feature.code);
      console.log(`    📦 Feature: ${featureDef.code} (module: ${moduleDef.moduleCode})`);

      for (const permDef of featureDef.permissions) {
        await prisma.permissions.upsert({
          where: { permission_code: permDef.code },
          update: {
            permission_name: permDef.name,
            action_type: permDef.action,
            feature_code: feature.code,
          },
          create: {
            permission_code: permDef.code,
            permission_name: permDef.name,
            action_type: permDef.action,
            feature_code: feature.code,
          },
        });
        allPermissionCodes.push(permDef.code);
        console.log(`      🔐 Permission: ${permDef.code}`);
      }
    }
  }

  // ── 3. Seed plan_role_permissions (plan_code × role_hierarchy_id × permission_id) ──
  ROLE_DEFAULT_PERMISSIONS[1] = allPermissionCodes;

  const plans = await prisma.plans.findMany();
  const roleHierarchies = await prisma.role_hierarchy.findMany();
  const allPermissions = await prisma.permissions.findMany();
  const permCodeToId = new Map(allPermissions.map((p) => [p.permission_code, p.id]));

  for (const plan of plans) {
    for (const rh of roleHierarchies) {
      const permCodes = ROLE_DEFAULT_PERMISSIONS[rh.level] ?? [];
      for (const code of permCodes) {
        const permId = permCodeToId.get(code);
        if (!permId) continue;
        await prisma.plan_role_permissions.upsert({
          where: {
            plan_code_role_hierarchy_id_permission_id: {
              plan_code: plan.code,
              role_hierarchy_id: rh.id,
              permission_id: permId,
            },
          },
          update: {},
          create: {
            plan_code: plan.code,
            role_hierarchy_id: rh.id,
            permission_id: permId,
          },
        });
      }
      console.log(`  📋 Plan ${plan.code} → ${rh.name} (level ${rh.level}): ${permCodes.length} permissions`);
    }
  }

  // ── 4. Link plans to UI modules (plan_modules) ──
  const seededModuleIds = Array.from(moduleIdByCode.values());
  for (const plan of plans) {
    for (const modId of seededModuleIds) {
      await prisma.plan_modules.upsert({
        where: {
          plan_id_module_id: {
            plan_id: plan.id,
            module_id: modId,
          },
        },
        update: { included: true },
        create: {
          plan_id: plan.id,
          module_id: modId,
          included: true,
        },
      });
    }
    console.log(`  📦 Plan ${plan.code}: linked ${seededModuleIds.length} UI modules`);
  }

  // ── 5. Link plans to UI features (plan_features) ──
  for (const plan of plans) {
    for (const featCode of seededFeatureCodes) {
      await prisma.plan_features.upsert({
        where: {
          plan_code_feature_code: {
            plan_code: plan.code,
            feature_code: featCode,
          },
        },
        update: { included: true },
        create: {
          plan_code: plan.code,
          feature_code: featCode,
          included: true,
        },
      });
    }
    console.log(`  📋 Plan ${plan.code}: linked ${seededFeatureCodes.length} UI features`);
  }

  console.log('\n✅ UI-aligned permission seed completed!');
  console.log(`   Modules (UI): ${seededModuleCodes.length}`);
  console.log(`   Permissions (UI): ${allPermissionCodes.length}`);
  console.log('   Existing rows in modules/features/permissions are unchanged; only UI-aligned rows were upserted.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
