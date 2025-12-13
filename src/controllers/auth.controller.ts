// src/controllers/auth.controller.ts
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { comparePassword, hashPassword, genToken, sha256, signJwt } from '../services/auth';
import { sendInviteMail } from '../services/email';
import { config } from '../config';

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const InviteBody = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  institutionId: z.number().int().optional().nullable(),
});

const ConsumeInviteBody = z.object({
  email: z.string().email(),
  token: z.string(),
});

const ChangePasswordBody = z.object({
  newPassword: z.string().min(8),
  oldPassword: z.string().optional(),
});

function serializeUserForAuth(user: any) {
  return {
    id: typeof user.id === 'bigint' ? user.id.toString() : user.id,
    email: user.email,
  };
}

export async function loginHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parsed = LoginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error });
    }
    const { email, password } = parsed.data;

    const prisma = (request as any).prisma;
    const user = await prisma.users.findFirst({ where: { email } });
    if (!user || !user.password_hash) return reply.code(401).send({ error: 'Invalid credentials' });

    const ok = await comparePassword(password, user.password_hash);
    if (!ok) return reply.code(401).send({ error: 'Invalid credentials' });

    if (user.status && user.status !== 'active')
      return reply.code(403).send({ error: 'User not active' });

    const userId = typeof user.id === 'bigint' ? user.id.toString() : user.id;
    const token = signJwt({ sub: userId, email: user.email });

    // update last_login_at, ignore errors
    prisma.users
      .update({ where: { id: user.id }, data: { last_login_at: new Date() } })
      .catch(() => null);

    return reply.send({
      token,
      must_change_password: !!user.must_change_password,
      user: serializeUserForAuth(user),
    });
  } catch (err: any) {
    request.server.log.error({ err }, 'loginHandler failed');
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

export async function generateInviteHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parsed = InviteBody.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error });
    const { email, firstName, lastName, institutionId } = parsed.data;

    const prisma = (request as any).prisma;
    const mailer = (request.server as any).mailer;

    let user = await prisma.users.findFirst({
      where: { email, institution_id: institutionId ?? undefined },
    });
    if (!user) {
      user = await prisma.users.create({
        data: {
          email,
          first_name: firstName ?? null,
          last_name: lastName ?? null,
          institution_id: institutionId ?? null,
          status: 'invited',
          must_change_password: true,
        },
      });
    }

    const { token: rawToken, hash: tokenHash } = genToken();
    const expiresAt = new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000);

    await prisma.auth_tokens.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        type: 'one_time_login',
        expires_at: expiresAt,
      },
    });
    
    const link = `${config.oneTimeLinkBase}?token=${rawToken}&email=${encodeURIComponent(email)}`;
    try {
      console.log('---- INVITE DEBUG ----');
      console.log('RAW TOKEN:', rawToken);
      console.log('HASH STORED:', tokenHash);
      console.log('EMAIL SENT LINK:', link);

      await sendInviteMail(mailer, email, link, `${firstName ?? ''} ${lastName ?? ''}`.trim());
    } catch (e) {
      request.server.log.warn({ err: e }, 'sendInviteMail failed');
    }

    return reply.send({ message: 'If the email exists, an invite has been sent.' });
  } catch (err: any) {
    request.server.log.error({ err }, 'generateInviteHandler failed');
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

export async function consumeInviteHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parsed = ConsumeInviteBody.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error });
    const { email, token } = parsed.data;

    const prisma = (request as any).prisma;
    const tokenHash = sha256(token);
    const now = new Date();

    const tokenRec = await prisma.auth_tokens.findFirst({
      where: {
        token_hash: tokenHash,
        type: 'one_time_login',
        used_at: null,
        expires_at: { gt: now },
      },
    });
    if (!tokenRec) return reply.code(401).send({ error: 'Invalid or expired link' });

    const user = await prisma.users.findUnique({ where: { id: tokenRec.user_id } });
    if (!user || user.email !== email)
      return reply.code(401).send({ error: 'Invalid token or email' });

    await prisma.auth_tokens.updateMany({
      where: { user_id: user.id, used_at: null },
      data: { used_at: new Date() },
    });

    if (user.must_change_password) {
      const temp = signJwt({
        sub: user.id.toString(),
        email: user.email,
        temp: true,
        must_change_password: true,
      });
      return reply.send({ token: temp, must_change_password: true });
    }

    const jwt = signJwt({ sub: user.id.toString(), email: user.email });
    return reply.send({ token: jwt, must_change_password: false });
  } catch (err: any) {
    request.server.log.error({ err }, 'consumeInviteHandler failed');
    return reply.code(500).send({ error: 'Internal server error' });
  }
}

export async function changePasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parsed = ChangePasswordBody.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error });

    const { newPassword, oldPassword } = parsed.data;
    const payload = (request as any).user;
    if (!payload) return reply.code(401).send({ error: 'Unauthorized' });

    const prisma = (request as any).prisma;
    if (oldPassword) {
      const dbUser = await prisma.users.findUnique({ where: { id: Number(payload.sub) } });
      if (!dbUser) return reply.code(404).send({ error: 'User not found' });

      const ok = await comparePassword(oldPassword, dbUser.password_hash || '');
      if (!ok) return reply.code(401).send({ error: 'Invalid old password' });
    }

    const hashed = await hashPassword(newPassword);
    await prisma.users.update({
      where: { id: Number(payload.sub) },
      data: { password_hash: hashed, must_change_password: false, status: 'active' },
    });

    await prisma.auth_tokens.updateMany({
      where: { user_id: Number(payload.sub), used_at: null },
      data: { used_at: new Date() },
    });

    const jwt = signJwt({ sub: payload.sub, email: payload.email });
    return reply.send({ token: jwt });
  } catch (err: any) {
    request.server.log.error({ err }, 'changePasswordHandler failed');
    return reply.code(500).send({ error: 'Internal server error' });
  }
}
