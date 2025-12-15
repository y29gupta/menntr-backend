import fp from 'fastify-plugin';
import nodemailer from 'nodemailer';
import { config } from '../config';

export default fp(async (fastify) => {
  const { smtp } = config;

  if (!smtp.smtpHost || !smtp.smtpPort || !smtp.smtpUser || !smtp.smtpPass) {
    fastify.log.warn('SMTP config missing. Invite mailer disabled.');
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

  // DO NOT await this
  transporter
    .verify()
    .then(() => {
      fastify.log.info('SMTP transporter verified');
    })
    .catch((err) => {
      fastify.log.error({ err }, 'SMTP verification failed');
    });

  fastify.decorate('inviteMailer', transporter);
});
