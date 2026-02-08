import fp from 'fastify-plugin';
import nodemailer from 'nodemailer';
import { config } from '../config';

export default fp(async (fastify) => {
  const { smtp } = config;

  if (!smtp.smtpHost || !smtp.smtpPort || !smtp.smtpUser || !smtp.smtpPass) {
    fastify.log.warn('SMTP not configured, inviteMailer disabled');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtp.smtpHost,
    port: Number(smtp.smtpPort),
    secure: false,
    auth: {
      user: smtp.smtpUser,
      pass: smtp.smtpPass,
    },
  });

  // await transporter.verify();

  // fastify.decorate('inviteMailer', transporter);
});
