import { PrismaClient } from '@prisma/client';
import { pagination } from 'prisma-extension-pagination';

export const prisma = new PrismaClient().$extends(
  pagination({
    pages: {
      includePageCount: true,
      limit: 10,
    },
  })
);
