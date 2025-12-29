// src/plugins/cookie.ts
import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import { FastifyInstance } from 'fastify';
import { config } from '../config';

export default fp(async function cookiePlugin(fastify: FastifyInstance) {
  fastify.register(cookie, {
    secret: config.cookieSecret,
  });
});
