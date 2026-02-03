import { PrismaClient } from '@prisma/client';

function getISTDateParts(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  const parts = formatter.formatToParts(date);

  return {
    year: Number(parts.find((p) => p.type === 'year')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value),
    day: Number(parts.find((p) => p.type === 'day')?.value),
  };
}

export async function getGroupedNotifications(prisma: PrismaClient, userId: bigint) {
  const notifications = await prisma.notifications.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    take: 50,
  });

  const todayIST = getISTDateParts(new Date());

  const grouped = {
    today: [] as any[],
    yesterday: [] as any[],
    older: [] as any[],
  };

  for (const n of notifications) {
    const createdIST = getISTDateParts(new Date(n.created_at));

    if (
      createdIST.year === todayIST.year &&
      createdIST.month === todayIST.month &&
      createdIST.day === todayIST.day
    ) {
      grouped.today.push(n);
    } else if (
      createdIST.year === todayIST.year &&
      createdIST.month === todayIST.month &&
      createdIST.day === todayIST.day - 1
    ) {
      grouped.yesterday.push(n);
    } else {
      grouped.older.push(n);
    }
  }

  return grouped;
}

/**
 * Bell unread count
 */
export async function getUnreadCount(prisma: PrismaClient, userId: bigint) {
  return prisma.notifications.count({
    where: {
      user_id: userId,
      is_read: false,
    },
  });
}

/**
 * Mark single notification read
 */
export async function markAsRead(prisma: PrismaClient, notificationId: bigint, userId: bigint) {
  await prisma.notifications.updateMany({
    where: {
      id: notificationId,
      user_id: userId,
    },
    data: { is_read: true },
  });
}

/**
 * Mark all read (used by "Clear all" / "Got it")
 */
export async function markAllAsRead(prisma: PrismaClient, userId: bigint) {
  await prisma.notifications.updateMany({
    where: {
      user_id: userId,
      is_read: false,
    },
    data: { is_read: true },
  });
}
