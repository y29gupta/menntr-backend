import 'dotenv/config';
import { Worker } from 'bullmq';
import { prisma } from '../prisma/client';
import { redis } from '../utils/redis';


new Worker(
  'broadcast-queue',
  async (job) => {
    const broadcastId = BigInt(job.data.broadcastId); // 🔥 FIX

    const broadcast = await prisma.broadcasts.findUnique({
      where: { id: broadcastId },
      include: { targets: true },
    });

    if (!broadcast) return;

    const institutionIds =
      broadcast.target_type === 'ALL' ? undefined : broadcast.targets.map((t) => t.institution_id);

    const admins = await prisma.users.findMany({
      where: {
        ...(institutionIds && {
          institution_id: { in: institutionIds },
        }),
        user_roles: {
          some: {
            role: { name: 'Institution Admin' },
          },
        },
      },
    });

    if (!admins.length) return;

    await prisma.notifications.createMany({
      data: admins.map((admin) => ({
        user_id: admin.id,
        title: broadcast.title,
        message: broadcast.message,
        created_at: new Date(),
      })),
    });
  },
  {
    connection: redis,
    concurrency: 5,
  }
);
