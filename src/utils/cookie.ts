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

  // Helper to get common cookie options
  private static getCommonCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: 'lax',
      path: '/',
      ...(config.isProduction && {
        domain: new URL(config.frontend.frontendUrl).hostname,
      }),
    };
  }

  static setAuthToken(reply: FastifyReply, token: string, maxAge?: number) {
    const cookieOptions: CookieOptions = {
      ...this.getCommonCookieOptions(),
      maxAge: maxAge || config.jwt.expiresIn, // 7 days default
    };

    reply.setCookie(this.TOKEN_COOKIE_NAME, token, cookieOptions);
  }

  static setRefreshToken(reply: FastifyReply, refreshToken: string) {
    const cookieOptions: CookieOptions = {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/auth/refresh',
      ...(config.isProduction && {
        domain: new URL(config.frontend.frontendUrl).hostname,
      }),
    };

    reply.setCookie(this.REFRESH_TOKEN_COOKIE_NAME, refreshToken, cookieOptions);
  }

  static clearAuthCookies(reply: FastifyReply) {
    //  FIXED: Must match the options used when setting the cookie
    const clearOptions: CookieOptions = {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      ...(config.isProduction && {
        domain: new URL(config.frontend.frontendUrl).hostname,
      }),
    };

    // Clear auth token
    reply.clearCookie(this.TOKEN_COOKIE_NAME, clearOptions);

    // Clear refresh token with its specific path
    reply.clearCookie(this.REFRESH_TOKEN_COOKIE_NAME, {
      ...clearOptions,
      path: '/auth/refresh',
    });
  }

  static getAuthToken(request: any): string | undefined {
    return request.cookies?.[this.TOKEN_COOKIE_NAME];
  }
}
