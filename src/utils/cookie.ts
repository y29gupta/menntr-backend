import { FastifyReply } from 'fastify';
import { config } from '../config';

export interface CookieOptions {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    maxAge?: number;
    path?: string;
    domain?: string;
}

export class CookieManager {
  private static readonly TOKEN_COOKIE_NAME = 'auth_token';
  private static readonly REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';

  static setAuthToken(reply: FastifyReply, token: string, maxAge?: number) {
    const cookieOptions: CookieOptions = {
      httpOnly: true, // Prevents JavaScript access (XSS protection)
      // secure: config.isProduction, // HTTPS only in production
      secure: false,
      // sameSite: config.isProduction ? 'strict' : 'lax', // CSRF protection
      sameSite: 'lax',
      maxAge: maxAge || config.jwt.expiresIn, // 7 days default
      path: '/',
      ...(config.isProduction && {
        domain: new URL(config.frontendUrl).hostname,
      }),
    };

    reply.setCookie(this.TOKEN_COOKIE_NAME, token, cookieOptions);
  }

  static setRefreshToken(reply: FastifyReply, refreshToken: string) {
    const cookieOptions: CookieOptions = {
      httpOnly: true,
      // secure: config.isProduction,
      secure: false,
      // sameSite: config.isProduction ? 'strict' : 'lax',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/auth/refresh',
    };

    reply.setCookie(this.REFRESH_TOKEN_COOKIE_NAME, refreshToken, cookieOptions);
  }

  static clearAuthCookies(reply: FastifyReply) {
    reply.clearCookie(this.TOKEN_COOKIE_NAME, { path: '/' });
    reply.clearCookie(this.REFRESH_TOKEN_COOKIE_NAME, { path: '/auth/refresh' });
  }

  static getAuthToken(request: any): string | undefined {
    return request.cookies?.[this.TOKEN_COOKIE_NAME];
  }
}