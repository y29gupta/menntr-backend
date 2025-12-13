import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const ConfigSchema = z.object({
  PORT: z.string().default('4000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // JWT Configuration
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PRIVATE_KEY_B64: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PUBLIC_KEY_B64: z.string().optional(),
  JWT_ISSUER: z.string().default('menntr'),
  JWT_AUDIENCE: z.string().default('menntr.api'),
  JWT_EXPIRES_IN: z.string().default('604800').transform(Number), // 7 days in seconds

  // Auth Configuration
  OTP_EXPIRY_MINUTES: z.string().default('15').transform(Number),
  ONE_TIME_LINK_BASE: z.string().default('http://localhost:3000/auth/one-time-login'),
  BCRYPT_SALT_ROUNDS: z.string().default('12').transform(Number),
  ENABLE_SUPERADMIN_CREATION: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // Database
  DATABASE_URL: z.string(),

  // Email (Azure Communication Services)
  ACS_CONNECTION_STRING: z.string(),
  ACS_FROM_EMAIL: z.string().email(),
  INVITE_FROM_EMAIL: z.string().email(),

  SMTP_HOST: z.string(),
  SMTP_PORT: z.string(),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
});

function fromEnvOrB64(envName: string, b64Name: string): string | undefined {
  const raw = process.env[envName];
  if (raw && raw.trim().length > 0) {
    return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  }

  const b64 = process.env[b64Name];
  if (b64 && b64.trim().length > 0) {
    try {
      return Buffer.from(b64, 'base64').toString('utf8');
    } catch (e) {
      throw new Error(`Invalid base64 for ${b64Name}: ${e}`);
    }
  }

  return undefined;
}

// Validate environment variables
const env = ConfigSchema.parse(process.env);

const privateKey = fromEnvOrB64('JWT_PRIVATE_KEY', 'JWT_PRIVATE_KEY_B64');
const publicKey = fromEnvOrB64('JWT_PUBLIC_KEY', 'JWT_PUBLIC_KEY_B64');

if (!privateKey || !publicKey) {
  throw new Error(
    'JWT keys are missing. Set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY (newline-escaped PEM) ' +
      'or JWT_PRIVATE_KEY_B64 and JWT_PUBLIC_KEY_B64 (base64-encoded PEM) in the environment.'
  );
}

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',

  jwt: {
    privateKey,
    publicKey,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: env.JWT_EXPIRES_IN,
  },

  auth: {
    otpExpiryMinutes: env.OTP_EXPIRY_MINUTES,
    oneTimeLinkBase: env.ONE_TIME_LINK_BASE,
    bcryptSaltRounds: env.BCRYPT_SALT_ROUNDS,
    allowSuperAdminCreation: env.ENABLE_SUPERADMIN_CREATION || !env.NODE_ENV.includes('production'),
  },

  database: {
    url: env.DATABASE_URL,
  },

  email: {
    acsConnectionString: env.ACS_CONNECTION_STRING,
    fromEmail: env.ACS_FROM_EMAIL,
    inviteFromEmail: env.INVITE_FROM_EMAIL,
  },
  smtp: {
    smtpHost: env.SMTP_HOST,
    smtpPort: env.SMTP_PORT,
    smtpUser: env.SMTP_USER,
    smtpPass: env.SMTP_PASS,
//     SMTP_HOST=smtp.azurecomm.net
// SMTP_PORT=587
// SMTP_USER=invite@pathaxiom.com
// SMTP_PASS=pQ48Q~uZZ-6ecHFOn97Qd9MLr2WCNwtpSSonJb8x
  }
} as const;
