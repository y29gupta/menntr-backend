// src/index.ts
import Fastify, { FastifyInstance } from 'fastify';

const port = Number(process.env.PORT || 3000);
const fastify: FastifyInstance = Fastify({ logger: true });

fastify.get('/', async () => {
  return { hello: 'harish' };
});

fastify.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
