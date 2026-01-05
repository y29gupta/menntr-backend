import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Azure PG
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const free = await prisma.plans.create({
    data: { code: 'FREE', name: 'Free Trial', max_students: 50 },
  });

  const enterprise = await prisma.plans.create({
    data: { code: 'ENTERPRISE', name: 'Enterprise' },
  });

  const harvard = await prisma.institutions.create({
    data: {
      name: 'Harvard University',
      code: 'HARVARD',
      contact_email: 'admin@harvard.edu',
      plan_id: enterprise.id,
    },
  });

  const superAdminRole = await prisma.roles.create({
    data: { name: 'Super Admin', is_system_role: true },
  });

  const passwordHash = await bcrypt.hash('SuperAdmin@123', 10);

  const superAdmin = await prisma.users.create({
    data: {
      email: 'superadmin@menntr.com',
      password_hash: passwordHash,
      must_change_password: false,
    },
  });

  await prisma.user_roles.create({
    data: {
      user_id: superAdmin.id,
      role_id: superAdminRole.id,
    },
  });

  console.log('✅ Menntr seed completed');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
