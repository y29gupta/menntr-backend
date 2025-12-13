import { PrismaClient } from '../generated/prisma/client';
import type { EmailClient } from '@azure/communication-email';
import 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
// import type nodemailer from 'nodemailer';
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    prisma: PrismaClient;
    // mailer: nodemailer.Transporter;
    mailer: EmailClient;
  }

  interface FastifyRequest {
    prisma: PrismaClient;
    user?: any;
  }
}