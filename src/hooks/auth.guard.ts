import { FastifyRequest } from 'fastify';
import { AuthService } from '../services/auth';
import { CookieManager } from '../utils/cookie';
import { UnauthorizedError } from '../utils/errors';

export async function authGuard(request: FastifyRequest) {
  let token: string | undefined;

  // 1️⃣ Authorization header (Postman / Mobile / Swagger)
  if (request.headers.authorization) {
    token = AuthService.extractTokenFromHeader(
      request.headers.authorization
    );
  }

  // 2️⃣ Cookie (Browser flow)
  if (!token) {
    token = CookieManager.getAuthToken(request);
  }

  if (!token) {
    throw new UnauthorizedError('Authentication token missing');
  }

  try {
    const payload = AuthService.verifyJwt(token);
    (request as any).user = payload;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
