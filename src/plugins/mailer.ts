import fp from 'fastify-plugin';
import { EmailClient } from '@azure/communication-email';

export default fp(async (fastify) => {
  const connectionString = process.env.ACS_CONNECTION_STRING;

  if (!connectionString) {
    throw new Error('Missing ACS_CONNECTION_STRING in environment');
  }

  const emailClient = new EmailClient(connectionString);

  // attach to fastify instance
  fastify.decorate('mailer', emailClient);
});
