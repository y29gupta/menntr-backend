// src/app.ts
import fastify from 'fastify';
import prismaPlugin from './plugins/prisma';
import mailerPlugin from './plugins/mailer';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import institutionRoutes from './routes/institutions';
import { verifyJwt } from './services/auth';

export function buildApp() {
  const app = fastify({ logger: true });

  // Register runtime decorators / plugins
  app.register(prismaPlugin);
  app.register(mailerPlugin);

  // Authenticate decorator
  app.decorate('authenticate', async function (request: any, reply: any) {
    try {
      const auth = (request.headers &&
        (request.headers.authorization || request.headers.Authorization)) as string | undefined;

      if (!auth) {
        return reply.code(401).send({ error: 'Missing Authorization header' });
      }

      const parts = auth.split(' ');
      if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return reply.code(401).send({ error: 'Invalid Authorization header format' });
      }

      const token = parts[1];
      const payload = verifyJwt(token);
      request.user = payload;
      return;
    } catch (err: any) {
      app.log.warn('JWT verify failed: ' + String(err));
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // Register routes
  app.register(adminRoutes);
  app.register(authRoutes, { prefix: '/auth' });
  app.register(institutionRoutes);

  // Global error handler (optional) — keep default fastify behavior but log
  app.setErrorHandler((err, request, reply) => {
    app.log.error({ err, url: request.url, method: request.method }, 'Unhandled error');
    // Hide internals in response
    const status =  500;
    reply.status(status).send({ error: 'Internal Server Error' });
  });

  return app;
}
