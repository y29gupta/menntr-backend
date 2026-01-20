import fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import prismaPlugin from './plugins/prisma';
import mailerPlugin from './plugins/mailer';
import jwtPlugin from './plugins/jwt';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import institutionRoutes, { planRoutes } from './routes/institutions';
import { errorHandler } from './middleware/errorHandler';
import { config } from './config';
import inviteMailer from './plugins/inviteMailer';
import cookiePlugin from "./plugins/cookie";
import multipartPlugin from './plugins/multipart';
// import { requestUserPlugin } from './plugins/request-user-plugin';
import authPlugin from './plugins/auth.plugin';
import { forgotPasswordRoutes } from './routes/forgot-password';
import { departmentRoutes } from './routes/department.routes';
import { organizationRoutes } from './routes/organization.routes';
import { categoryRoutes } from './routes/category.routes';
import {userManagementRoutes} from './routes/userManagement.routes';
import { batchRoutes } from './routes/batch.routes';
// import {mcqRoutes} from './routes/mcq.routes';
import { assessmentRoutes } from './routes/assessment.routes';
// import multipart from '@fastify/multipart';
import {institutionAdminRoutes} from './routes/institution.admin';
import {dashboardRoutes} from "./routes/dashboard.routes";
import { rateLimitPlugin } from './plugins/rateLimit';

export function buildApp() {
  const app = fastify({
    logger: {
      level: config.isDevelopment ? 'debug' : 'info',
      ...(config.isProduction && {
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }),
    },
  });

  // app.register(multipart, {
  //   attachFieldsToBody: false,
  // });

  app.register(cors, {
    origin: [config.frontend.frontendUrl, "https://menntr-frontend.netlify.app"],
    credentials: true, // allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Register cookie support
  // app.register(cookie, {
  //   secret: config.cookieSecret,
  //   hook: 'onRequest',
  //   parseOptions: {},
  // });

  // Register plugins
  app.register(cookiePlugin);
  app.register(prismaPlugin);
  app.register(mailerPlugin);
  app.register(multipartPlugin);
  app.register(jwtPlugin);
  app.register(inviteMailer);
  // app.register(requestUserPlugin);
  app.register(authPlugin);
  app.register(rateLimitPlugin);

  // Request logging hook - track start time
  app.addHook('onRequest', async (request) => {
    (request as any).startTime = Date.now();
    request.log.info(
      {
        type: 'REQUEST',
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
      'Incoming request'
    );
  });

  // Response logging hook - calculate response time
  app.addHook('onResponse', async (request, reply) => {
    const responseTime = Date.now() - ((request as any).startTime || Date.now());
    request.log.info(
      {
        type: 'RESPONSE',
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: `${responseTime}ms`,
      },
      'Request completed'
    );
  });

  // Register routes
  app.register(adminRoutes);
  app.register(authRoutes, { prefix: '/auth' });
  app.register(institutionRoutes);
  app.register(planRoutes);
  app.register(forgotPasswordRoutes);
  app.register(departmentRoutes);
  app.register(organizationRoutes);
  app.register(categoryRoutes);
  app.register(userManagementRoutes);
  app.register(batchRoutes);
  // app.register(mcqRoutes);
  app.register(assessmentRoutes);
  app.register(institutionAdminRoutes);
  app.register(dashboardRoutes);
  // Health check endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // Global error handler
  app.setErrorHandler(errorHandler);

  return app;
}
