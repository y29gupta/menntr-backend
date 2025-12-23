import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { CookieManager } from '../utils/cookie';
import { AuthService } from '../services/auth';
import { AuthJwtPayload } from '../types/jwt';

export default fp(async function authPlugin(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request) => {
    request.log.info(
      {
        cookies: request.cookies,
        authToken: request.cookies?.auth_token,
      },
      'Auth debug'
    );

    const token = CookieManager.getAuthToken(request);
    if (!token) return;

    const payload = AuthService.verifyJwt(token) as AuthJwtPayload;

    request.user = {
      sub: payload.sub,
      email: payload.email,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
    };
  });
});
