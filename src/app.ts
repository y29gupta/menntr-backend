import Fastify from 'fastify';
import cors from '@fastify/cors';
import prismaPlugin from './plugins/prisma';
import jwtPlugin from './plugins/jwt';
import emailPlugin from './plugins/email';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import { config } from './config';

export function buildApp() {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true, credentials: true });

  app.register(prismaPlugin);
  app.register(jwtPlugin);
  app.register(emailPlugin);

  app.register(authRoutes, { prefix: '/auth' });
  app.register(adminRoutes, { prefix: '/admin' });

  app.get('/health', async () => ({ ok: true }));

  return app;
}
