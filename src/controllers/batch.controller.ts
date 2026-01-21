import { FastifyRequest, FastifyReply } from 'fastify';
import {
  CreateBatchSchema,
  UpdateBatchSchema,
} from '../schemas/batch.zod';
import {
  listBatches,
  createBatch,
  updateBatch,
  deleteBatch,
  getBatchMeta,
} from '../services/batch.service';
import { ForbiddenError, ValidationError } from '../utils/errors';

export async function listBatchHandler(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = req.prisma;
  const user_id = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  if (!user?.institution_id) throw new ForbiddenError('No institution');

  const batches = await listBatches(prisma, user.institution_id);

  reply.send(
    batches.map(b => {
      const startYear = b.start_date
        ? new Date(b.start_date).getFullYear()
        : null;
      const endYear = b.end_date
        ? new Date(b.end_date).getFullYear()
        : null;

      return {
        id: b.id,
        name: b.name,
        category: b.category_role?.name ?? null,
        department: {
  id: b.department_role.id,
  name: b.department_role.name,
},

coordinator: b.coordinator
  ? {
      id: b.coordinator.id,
      name: `${b.coordinator.first_name ?? ''} ${b.coordinator.last_name ?? ''}`.trim(),
    }
  : null,

        // ✅ UI format
        academic_year:
          startYear && endYear ? `${startYear}-${endYear}` : null,

        students: b.students.length,
        status: b.is_active ? 'Active' : 'Inactive',
      };
    })
  );
}

// export async function createBatchHandler(
//   req: FastifyRequest,
//   reply: FastifyReply
// ) {
//   const parsed = CreateBatchSchema.safeParse(req.body);
//   if (!parsed.success)
//     throw new ValidationError('Invalid request', parsed.error.issues);

//   const prisma = req.prisma;
//   const user_id = BigInt((req as any).user.sub);

//   const user = await prisma.users.findUnique({
//     where: { id: user_id },
//     select: { institution_id: true },
//   });

//   if (!user?.institution_id) throw new ForbiddenError('No institution');

//   const batch = await createBatch(prisma, user.institution_id, parsed.data);
//   reply.code(201).send(batch);
// }

// export async function updateBatchHandler(
//   req: FastifyRequest,
//   reply: FastifyReply
// ) {
//   const parsed = UpdateBatchSchema.safeParse(req.body);
//   if (!parsed.success)
//     throw new ValidationError('Invalid request', parsed.error.issues);

//   const prisma = req.prisma;
//   const id = Number((req.params as any).id);
//   const user_id = BigInt((req as any).user.sub);

//   const user = await prisma.users.findUnique({
//     where: { id: user_id },
//     select: { institution_id: true },
//   });

//   const batch = await updateBatch(
//     prisma,
//     id,
//     user!.institution_id!,
//     parsed.data
//   );

//   reply.send(batch);
// }

export async function deleteBatchHandler(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = req.prisma;
  const id = Number((req.params as any).id);
  const user_id = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  await deleteBatch(prisma, id, user!.institution_id!);
  reply.status(204).send();
}

export async function batchMetaHandler(
  req: FastifyRequest,
  reply: FastifyReply
) {
  const prisma = req.prisma;
  const user_id = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { institution_id: true },
  });

  const meta = await getBatchMeta(prisma, user!.institution_id!);
  reply.send(meta);
}

export async function createBatchHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsed = CreateBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const prisma = req.prisma;
  const userId = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution');
  }

  const data = {
    ...parsed.data,

    // ✅ convert Date → string
    startDate: parsed.data.startDate.toISOString(),
    endDate: parsed.data.endDate.toISOString(),

    // ✅ normalize BigInt-compatible ID
    coordinatorId: parsed.data.coordinatorId ? String(parsed.data.coordinatorId) : undefined,
  };

  const batch = await createBatch(prisma, user.institution_id, data);
  reply.code(201).send(batch);
}



export async function updateBatchHandler(req: FastifyRequest, reply: FastifyReply) {
  const parsed = UpdateBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid request', parsed.error.issues);
  }

  const prisma = req.prisma;
  const batchId = Number((req.params as any).id);
  const userId = BigInt((req as any).user.sub);

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { institution_id: true },
  });

  if (!user?.institution_id) {
    throw new ForbiddenError('No institution');
  }

  // ✅ BUILD OBJECT MANUALLY (NO SPREAD)
  const data: {
    name?: string;
    code?: string;
    categoryRoleId?: number | null;
    departmentRoleId?: number;
    coordinatorId?: string | null;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
    sections?: string[];
  } = {};

  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.code !== undefined) data.code = parsed.data.code;
  if (parsed.data.categoryRoleId !== undefined) data.categoryRoleId = parsed.data.categoryRoleId;
  if (parsed.data.departmentRoleId !== undefined)
    data.departmentRoleId = parsed.data.departmentRoleId;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
  if (parsed.data.sections !== undefined) data.sections = parsed.data.sections;

  if (parsed.data.startDate) {
    data.startDate = parsed.data.startDate.toISOString();
  }

  if (parsed.data.endDate) {
    data.endDate = parsed.data.endDate.toISOString();
  }

  if (parsed.data.coordinatorId !== undefined) {
    data.coordinatorId =
      parsed.data.coordinatorId === null ? null : String(parsed.data.coordinatorId);
  }

  const batch = await updateBatch(prisma, batchId, user.institution_id, data);

  reply.send(batch);
}




