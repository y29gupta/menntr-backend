import { PrismaClient, BroadcastTargetType } from '@prisma/client';
import { broadcastQueue } from '../queues/broadcast.queue';

interface SendBroadcastInput {
  title: string;
  message: string;
  send_to_all: boolean;
  institution_ids: number[];
  created_by: bigint;
}

export async function listInstitutions(prisma: PrismaClient) {
  return prisma.institutions.findMany({
    where: { status: 'active' },
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: 'asc' },
  });
}

// export async function sendBroadcast(prisma: PrismaClient, input: SendBroadcastInput) {
//   const broadcast = await prisma.broadcasts.create({
//     data: {
//       title: input.title,
//       message: input.message,
//       created_by: input.created_by,
//       target_type: input.send_to_all ? BroadcastTargetType.ALL : BroadcastTargetType.SELECTED,
//     },
//   });

//   if (!input.send_to_all) {
//     await prisma.broadcast_targets.createMany({
//       data: input.institution_ids.map((id) => ({
//         broadcast_id: broadcast.id,
//         institution_id: id,
//       })),
//     });
//   }

//   await broadcastQueue.add('broadcast', {
//     broadcastId: broadcast.id.toString(),
//   });

//   return broadcast;
// }


/**
 * SUPER ADMIN → PLATFORM ANNOUNCEMENT
 * Targets ONLY Institution Admins
 */
export async function sendPlatformBroadcast(
  prisma: PrismaClient,
  input: {
    title: string;
    message: string;
    institution_ids: number[]; // empty = ALL
    created_by: bigint;
  }
) {
  const broadcast = await prisma.broadcasts.create({
    data: {
      title: input.title,
      message: input.message,
      created_by: input.created_by,
      target_type:
        input.institution_ids.length === 0 ? BroadcastTargetType.ALL : BroadcastTargetType.SELECTED,
    },
  });

  if (input.institution_ids.length > 0) {
    await prisma.broadcast_targets.createMany({
      data: input.institution_ids.map((id) => ({
        broadcast_id: broadcast.id,
        institution_id: id,
      })),
    });
  }

  await broadcastQueue.add('broadcast', {
    broadcastId: broadcast.id.toString(),
  });

  return broadcast;
}

/**
 * INSTITUTION ADMIN → INSTITUTION ANNOUNCEMENT
 */
export async function sendInstitutionBroadcast(
  prisma: PrismaClient,
  input: {
    title: string;
    message: string;
    institution_id: number;
    created_by: bigint;
  }
) {
  const broadcast = await prisma.broadcasts.create({
    data: {
      title: input.title,
      message: input.message,
      created_by: input.created_by,
      target_type: BroadcastTargetType.SELECTED,
    },
  });

  await prisma.broadcast_targets.create({
    data: {
      broadcast_id: broadcast.id,
      institution_id: input.institution_id,
    },
  });

  await broadcastQueue.add('broadcast', {
    broadcastId: broadcast.id.toString(),
  });

  return broadcast;
}
