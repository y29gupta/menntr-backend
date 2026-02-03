import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { prisma, shutdownPrisma } from '../prisma/client';
import { pagination } from 'prisma-extension-pagination';

export default fp(async function prismaPlugin(fastify: FastifyInstance) {
  const extendedPrisma = prisma.$extends(
    pagination({
      pages: { includePageCount: true, limit: 10 },
    })
  );

  fastify.decorate('prisma', extendedPrisma);

  fastify.addHook('onRequest', async (request) => {
    (request as any).prisma = extendedPrisma;
  });

  fastify.addHook('onClose', async () => {
    fastify.log.info('Closing Prisma');
    await shutdownPrisma();
  });
});
