import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter }) as any;

async function prismaPlugin(fastify: FastifyInstance) {
  // Decorate fastify instance with prisma (using any to avoid type issues)
  (fastify as any).decorate('prisma', prisma);

  // Add hook to handle request decoration
  fastify.addHook('onRequest', async (request) => {
    (request as any).prisma = prisma;
  });

  // Graceful shutdown
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
    await pool.end();
  });
}

export default fp(prismaPlugin);
