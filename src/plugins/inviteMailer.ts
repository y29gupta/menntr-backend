import fp from 'fastify-plugin';
import nodemailer from 'nodemailer';
import { config } from '../config';
export default fp(async (fastify) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('Missing SMTP configuration for invite mailer');
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.smtpHost,
    port: Number(config.smtp.smtpPort),
    secure: false, // TLS via STARTTLS
    auth: {
      user: config.smtp.smtpUser,
      pass: config.smtp.smtpPass,
    },
  });

  // verify once on startup
  await transporter.verify();

  fastify.decorate('inviteMailer', transporter);
});
