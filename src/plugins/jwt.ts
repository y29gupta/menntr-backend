import fp from 'fastify-plugin';
import { config } from '../config';

export default fp(async (fastify) => {
  fastify.register(require('fastify-jwt'), {
    secret: {
      private: config.jwt.privateKey,
      public: config.jwt.publicKey,
    },
    sign: {
      algorithm: 'RS256',
      expiresIn: config.jwt.expiresIn,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    },
    verify: {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithms: ['RS256'],
    },
  });

  // auth decorator
  fastify.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });
});
