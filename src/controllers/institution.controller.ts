// src/controllers/institution.controller.ts
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const CreateInstitutionBody = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  subdomain: z.string().optional().nullable(),
  contactEmail: z.string().email(),
  planId: z.number().int().optional().nullable(),
});

function serializeInstitution(inst: any) {
  // convert bigint id if present
  return {
    id: typeof inst.id === 'bigint' ? inst.id.toString() : inst.id,
    name: inst.name,
    code: inst.code,
    subdomain: inst.subdomain,
    contact_email: inst.contact_email,
    plan_id:
      inst.plan_id == null
        ? null
        : typeof inst.plan_id === 'bigint'
          ? inst.plan_id.toString()
          : inst.plan_id,
    status: inst.status,
    created_at: inst.created_at ?? null,
    updated_at: inst.updated_at ?? null,
  };
}

export async function createInstitutionHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const parsed = CreateInstitutionBody.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Invalid request', details: parsed.error });

    const { name, code, subdomain, contactEmail, planId } = parsed.data;
    const prisma = (request as any).prisma;

    const inst = await prisma.institutions.create({
      data: {
        name,
        code,
        subdomain,
        contact_email: contactEmail,
        plan_id: planId ?? null,
        status: 'active',
      },
    });

    return reply.code(201).send(serializeInstitution(inst));
  } catch (err: any) {
    request.server.log.error({ err }, 'createInstitutionHandler failed');
    return reply.code(500).send({ error: 'Internal server error' });
  }
}
