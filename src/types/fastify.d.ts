import 'fastify';
import type { PrismaClient } from '../generated/prisma/client';
import type { EmailClient } from '@azure/communication-email';
import type nodemailer from 'nodemailer';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    inviteMailer: nodemailer.Transporter;
    mailer: EmailClient;
  }

  interface FastifyRequest {
    prisma: PrismaClient;
    user?: {
      sub: string;
      email: string;
      roles: string[];
      institution_id: number;
    };
  }
}
