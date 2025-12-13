// src/controllers/admin.controller.ts
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { hashPassword, signJwt } from '../services/auth';

// Simple helper to serialize Prisma user model safely
function serializeUser(user: any) {
  return {
    id: typeof user.id === 'bigint' ? user.id.toString() : user.id,
    email: user.email,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    institution_id:
      user.institution_id == null
        ? null
        : typeof user.institution_id === 'bigint'
          ? user.institution_id.toString()
          : user.institution_id,
    status: user.status ?? null,
    created_at: user.created_at ?? null,
    updated_at: user.updated_at ?? null,
  };
}

const CreateSuperAdminBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export async function createSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  const fastify = request.server as any;
  try {
    const allow =
      process.env.ENABLE_SUPERADMIN_CREATION === 'true' || process.env.NODE_ENV !== 'production';
    if (!allow) return reply.code(403).send({ error: 'Not allowed' });

    const parsed = CreateSuperAdminBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error });
    }
    const { email, password, firstName, lastName } = parsed.data;

    const prisma = (request as any).prisma;

    const existing = await prisma.users.findFirst({ where: { email } });
    if (existing) return reply.code(409).send({ error: 'User already exists' });

    const password_hash = await hashPassword(password);

    const created = await prisma.users.create({
      data: {
        email,
        password_hash,
        first_name: firstName ?? null,
        last_name: lastName ?? null,
        status: 'active',
        must_change_password: false,
      },
    });

    // Optional: assign super admin role (best-effort; don't fail on error)
    try {
      const superRole = await prisma.roles.findFirst({
        where: { is_system_role: true, name: 'Super Admin' },
      });
      if (superRole) {
        await prisma.user_roles.create({
          data: {
            user_id: created.id,
            role_id: superRole.id,
            assigned_by: created.id,
          },
        });
      }
    } catch (e) {
      fastify.log.warn({ err: e }, 'failed to auto-assign super role');
    }

    const payload = {
      sub: typeof created.id === 'bigint' ? created.id.toString() : String(created.id),
      email: created.email,
      roles: ['superadmin'],
    };
    const token = signJwt(payload);

    return reply.code(201).send({ token, user: serializeUser(created) });
  } catch (err: any) {
    request.server.log.error({ err }, 'createSuperAdmin failed');
    return reply.code(500).send({ error: 'Internal server error' });
  }
}
