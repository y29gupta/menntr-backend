import { FastifyRequest } from 'fastify';
import { AuthService } from '../services/auth';
import { CookieManager } from '../utils/cookie';
import { UnauthorizedError } from '../utils/errors';

export async function authGuard(request: FastifyRequest) {
  let token: string | undefined;

  // 1️⃣ Try Authorization header first (Postman, mobile, temp flows)
  if (request.headers.authorization) {
    token = AuthService.extractTokenFromHeader(
      request.headers.authorization
    );
  }

  // 2️⃣ Fallback to cookie (browser session)
  if (!token) {
    token = CookieManager.getAuthToken(request);
  }

  if (!token) {
    throw new UnauthorizedError();
  }

  const payload = AuthService.verifyJwt(token);

  // Attach to request
  (request as any).user = payload;
}
