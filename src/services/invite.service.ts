import { PrismaClient, token_type } from '@prisma/client';
import { AuthService } from './auth';
import { EmailService } from './email';
import { config } from '../config';

export type InviteType = 'institution' | 'hod' | 'principal' | 'faculty';

interface SendInviteParams {
  prisma: PrismaClient;
  emailService: EmailService;
  userId: bigint;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  inviteType: InviteType;
  institutionName?: string;
  institutionCode?: string;
  inviterName?: string;
  role?: string;
}

export async function sendInviteInternal({
  prisma,
  emailService,
  userId,
  email,
  firstName,
  lastName,
  inviteType,
  institutionName,
  institutionCode,
  inviterName,
  role,
}: SendInviteParams): Promise<void> {
  const { token, hash } = AuthService.generateToken();

  const expiresAt = new Date(Date.now() + config.auth.otpExpiryMinutes * 60 * 1000);

  await prisma.auth_tokens.create({
    data: {
      user_id: userId,
      token_hash: hash,
      type: token_type.email_verification,
      expires_at: expiresAt,
    },
  });

  const link = `${config.auth.oneTimeLinkBase}?token=${token}`;

  await emailService.sendInvite(email, link, inviteType, {
    recipientName: `${firstName ?? ''} ${lastName ?? ''}`.trim(),
    institutionName,
    institutionCode,
    inviterName,
    role,
  });
}
