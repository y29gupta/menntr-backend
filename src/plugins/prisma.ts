import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

export default fp(async function prismaPlugin(fastify: FastifyInstance) {
  const databaseUrl = process.env.DATABASE_URL;

  // ✅ Fail fast with a clear error
  if (!databaseUrl || typeof databaseUrl !== 'string') {
    throw new Error('DATABASE_URL is missing or invalid');
  }

  // ✅ Create pool AFTER env is loaded
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }, // required for Azure PostgreSQL
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // Decorate fastify
  fastify.decorate('prisma', prisma);

  // Attach prisma to request
  fastify.addHook('onRequest', async (request) => {
    (request as any).prisma = prisma;
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    fastify.log.info('Closing Prisma & PG pool');
    await prisma.$disconnect();
    await pool.end();
  });
});
