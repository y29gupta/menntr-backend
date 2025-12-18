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
  const free = await prisma.plan.create({
    data: { code: 'FREE', name: 'Free Trial', maxStudents: 50 },
  });

  const enterprise = await prisma.plan.create({
    data: { code: 'ENTERPRISE', name: 'Enterprise' },
  });

  const harvard = await prisma.institution.create({
    data: {
      name: 'Harvard University',
      code: 'HARVARD',
      contactEmail: 'admin@harvard.edu',
      planId: enterprise.id,
    },
  });

  const superAdminRole = await prisma.role.create({
    data: { name: 'Super Admin', isSystemRole: true },
  });

  const passwordHash = await bcrypt.hash('SuperAdmin@123', 10);

  const superAdmin = await prisma.user.create({
    data: {
      email: 'superadmin@menntr.com',
      passwordHash,
      mustChangePassword: false,
    },
  });

  await prisma.userRole.create({
    data: {
      userId: superAdmin.id,
      roleId: superAdminRole.id,
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
