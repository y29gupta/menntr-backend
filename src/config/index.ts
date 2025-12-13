// src/config/index.ts
import dotenv from 'dotenv';
dotenv.config();

function fromEnvOrB64(envName: string, b64Name: string): string | undefined {
  const raw = process.env[envName];
  if (raw && raw.trim().length > 0) {
    // allow newline-escaped PEMs in .env (contains literal \n sequences)
    return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  }

  const b64 = process.env[b64Name];
  if (b64 && b64.trim().length > 0) {
    try {
      return Buffer.from(b64, 'base64').toString('utf8');
    } catch (e) {
      throw new Error(`Invalid base64 for ${b64Name}`);
    }
  }

  return undefined;
}

const privateKey = fromEnvOrB64('JWT_PRIVATE_KEY', 'JWT_PRIVATE_KEY_B64');
const publicKey = fromEnvOrB64('JWT_PUBLIC_KEY', 'JWT_PUBLIC_KEY_B64');

if (!privateKey || !publicKey) {
  // Fail fast with clear error
  throw new Error(
    'JWT keys are missing. Set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY (newline-escaped PEM) ' +
      'or JWT_PRIVATE_KEY_B64 and JWT_PUBLIC_KEY_B64 (base64-encoded PEM) in the environment.'
  );
}

export const config = {
  port: Number(process.env.PORT || 4000),

  jwt: {
    privateKey,
    publicKey,
    issuer: process.env.JWT_ISSUER || 'menntr',
    audience: process.env.JWT_AUDIENCE || 'menntr.api',
    expiresIn: 60 * 60 * 24 * 7,
  },

  otpExpiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES || 15),
  oneTimeLinkBase: process.env.ONE_TIME_LINK_BASE || 'http://localhost:3000/auth/one-time-login',

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },

  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS || 12),
  allowSuperAdminCreation:
    process.env.ENABLE_SUPERADMIN_CREATION === 'true' || process.env.NODE_ENV !== 'production',
};
