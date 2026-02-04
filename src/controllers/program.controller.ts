import { FastifyRequest, FastifyReply } from 'fastify';
import { getPrograms, createProgram } from '../services/program.service';
import { ValidationError, ForbiddenError } from '../utils/errors';
import { z } from 'zod';

const CreateProgramSchema = z.object({
  category_role_id: z.number().int().positive(),
  program_code: z.string().trim().min(1, 'Program code is required'),
  program_name: z.string().trim().min(1, 'Program name is required'),
});

export async function listPrograms(req: FastifyRequest, reply: FastifyReply) {
  const prisma = req.prisma;
  const user_id = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const category_role_id = (req.query as any)?.category_role_id
    ? Number((req.query as any).category_role_id)
    : undefined;

  const programs = await getPrograms(prisma, user.institution_id, category_role_id);

  reply.send(programs);
}

export async function addProgram(req: FastifyRequest, reply: FastifyReply) {
  const parsed = CreateProgramSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const prisma = req.prisma;
  const user_id = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution linked');
  }

  const program = await createProgram(prisma, user.institution_id, parsed.data);

  reply.code(201).send(program);
}
