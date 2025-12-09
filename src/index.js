const fastify = require('fastify')({ logger: true });
const port = process.env.PORT || 3000;

fastify.get('/', async (req, reply) => {
  return { hello: 'world' };
});

fastify.get('/health_check', async (req, reply) => {
  return { status: 'ok' };
})

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
