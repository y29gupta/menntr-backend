import bcrypt from 'bcrypt';
import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import { UnauthorizedError, ValidationError } from '../utils/errors';

type JwtPayloadOrString = string | JwtPayload;

export class AuthService {
  private static readonly BCRYPT_ROUNDS = config.auth.bcryptSaltRounds;

  static async hashPassword(password: string): Promise<string> {
    if (!password?.length) {
      throw new ValidationError('Password must be a non-empty string');
    }
    return bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }

  static async comparePassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) return false;
    return bcrypt.compare(password, hash);
  }

  static signJwt(payload: object): string {
    const { privateKey, issuer, audience, expiresIn } = config.jwt;

    if (!privateKey) {
      throw new Error('JWT private key not configured');
    }

    const options: SignOptions = {
      algorithm: 'RS256',
      expiresIn,
      issuer,
      audience,
    };

    return jwt.sign(payload, privateKey, options);
  }

  static verifyJwt(token: string): JwtPayloadOrString {
    const { publicKey, issuer, audience } = config.jwt;

    if (!publicKey) {
      throw new Error('JWT public key not configured');
    }

    return jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer,
      audience,
    }) as JwtPayloadOrString;
  }

  static sha256(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  static generateToken(bytes = 32): { token: string; hash: string } {
    const token = crypto.randomBytes(bytes).toString('hex');
    const hash = this.sha256(token);
    return { token, hash };
  }

  static extractTokenFromHeader(authHeader?: string): string {
    if (!authHeader) {
      throw new UnauthorizedError('Missing Authorization header');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new UnauthorizedError('Invalid Authorization header format');
    }

    return parts[1];
  }
}
