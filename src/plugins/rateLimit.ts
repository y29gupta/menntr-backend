import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

export const rateLimitPlugin = fp(async (fastify) => {
  await fastify.register(rateLimit, {
    global: false,
    max: 5,
    timeWindow: 60 * 60 * 1000, // 1 hour (ms)

    keyGenerator: (req) => req.ip,

    errorResponseBuilder: (req, context) => {
      const retryAfterSeconds = Math.ceil(context.ttl / 1000);

      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${retryAfterSeconds}s`,
        requestId: req.id,
      };
    },
  });
});
