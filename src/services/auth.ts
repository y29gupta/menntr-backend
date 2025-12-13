// src/services/auth.ts
import bcrypt from 'bcrypt';
import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

type JwtPayloadOrString = string | JwtPayload;

// Helper to convert env-style escaped newlines into real PEM newlines.
// Useful when you store keys in .env as: "-----BEGIN PRIVATE KEY-----\n...".
export function pemFromEnv(value?: string) {
  if (!value) return undefined;
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

const BCRYPT_ROUNDS = Number(config?.bcryptSaltRounds ?? 10);

/**
 * Hash a plaintext password using bcrypt.
 */
export async function hashPassword(pw: string) {
  if (typeof pw !== 'string' || !pw.length) throw new Error('password must be a non-empty string');
  return bcrypt.hash(pw, BCRYPT_ROUNDS);
}

/**
 * Compare plaintext password with stored bcrypt hash.
 */
export async function comparePassword(pw: string, hash: string) {
  if (typeof pw !== 'string' || typeof hash !== 'string') return false;
  return bcrypt.compare(pw, hash);
}

/**
 * Sign a JWT using RS256 and keys from config.
 * payload should be a plain object (claims).
 */
export function signJwt(payload: object) {
  const privateKeyRaw = config?.jwt?.privateKey;
  const privateKey = pemFromEnv(privateKeyRaw);
  if (!privateKey) throw new Error('JWT private key not configured');

  const options: SignOptions = {
    algorithm: 'RS256',
    expiresIn: config?.jwt?.expiresIn ?? '1h',
    issuer: config?.jwt?.issuer,
    audience: config?.jwt?.audience,
  };

  const token = jwt.sign(payload, privateKey, options);
  if (typeof token !== 'string') throw new Error('failed to sign jwt');
  return token;
}

/**
 * Verify a JWT. Throws on invalid token.
 * Returns the decoded payload.
 */
export function verifyJwt(token: string) {
  const publicKeyRaw = config?.jwt?.publicKey;
  const publicKey = pemFromEnv(publicKeyRaw);
  if (!publicKey) throw new Error('JWT public key not configured');

  const decoded = jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: config?.jwt?.issuer,
    audience: config?.jwt?.audience,
  }) as JwtPayloadOrString;

  return decoded;
}

/**
 * Simple SHA256 hex digest helper for token hashing, etc.
 */
export function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * Generate a secure random token and its sha256 hash.
 * Default length is 32 bytes (hex -> 64 chars).
 */
export function genToken(bytes = 32) {
  const token = crypto.randomBytes(bytes).toString('hex');
  const hash = sha256(token);
  return { token, hash };
}
