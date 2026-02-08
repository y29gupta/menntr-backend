import { PrismaClient, token_type } from '@prisma/client';
import { AuthService } from './auth';
import { EmailService } from './email';
import { config } from '../config';

export async function triggerStudentInvite(
  prisma: PrismaClient,
  emailService: EmailService,
  input: {
    userId: bigint;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    inviterName?: string;
  }
) {
  const { token, hash } = AuthService.generateToken();

  const expiresAt = new Date(Date.now() + config.auth.otpExpiryMinutes * 60 * 1000);

  // Optional: remove old tokens
  await prisma.auth_tokens.deleteMany({
    where: {
      user_id: input.userId,
      type: token_type.email_verification,
    },
  });

  await prisma.auth_tokens.create({
    data: {
      token_hash: hash,
      type: token_type.email_verification,
      expires_at: expiresAt,
      user: {
        connect: { id: input.userId },
      },
    },
  });

  const link = `${config.auth.oneTimeLinkBase}?token=${token}`;

  await emailService.sendInvite(link ? input.email : input.email, link, 'faculty', {
    recipientName: `${input.firstName ?? ''} ${input.lastName ?? ''}`.trim(),
    inviterName: input.inviterName,
    role: 'Student',
  });
}
