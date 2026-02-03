import IORedis from 'ioredis';

export const redis = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times) {
    if (times > 10) {
      console.error('❌ Redis unavailable after retries');
      return null; // stop retrying
    }
    return Math.min(times * 100, 2000);
  },
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
});
