import { Queue } from 'bullmq';
import { redis } from '../utils/redis';

export const broadcastQueue = new Queue('broadcast-queue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});
