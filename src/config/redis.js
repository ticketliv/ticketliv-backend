const Redis = require('ioredis');

let redis = null;

const getRedis = () => {
  if (!redis) {
    try {
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 3) {
            console.warn('⚠️ Redis: Max retries reached, operating without cache');
            return null;
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
      });

      redis.on('connect', () => console.log('🔴 Redis connected'));
      redis.on('error', (err) => console.warn('⚠️ Redis error:', err.message));

      redis.connect().catch(() => {
        console.warn('⚠️ Redis not available, running without cache');
        redis = null;
      });
    } catch {
      console.warn('⚠️ Redis not available');
      redis = null;
    }
  }
  return redis;
};

// Cache helper with graceful fallback
const cache = {
  async get(key) {
    const r = getRedis();
    if (!r) return null;
    try {
      const val = await r.get(key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },

  async set(key, value, ttlSeconds = 300) {
    const r = getRedis();
    if (!r) return;
    try {
      await r.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch { /* ignore */ }
  },

  async del(key) {
    const r = getRedis();
    if (!r) return;
    try {
      await r.del(key);
    } catch { /* ignore */ }
  },

  // Seat locking
  async lockSeat(eventId, seatId, userId, ttlSeconds = 900) {
    const r = getRedis();
    if (!r) return true; // If no Redis, allow (fallback to DB)
    const key = `seat:lock:${eventId}:${seatId}`;
    const result = await r.set(key, userId, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  },

  async unlockSeat(eventId, seatId) {
    const r = getRedis();
    if (!r) return;
    await r.del(`seat:lock:${eventId}:${seatId}`);
  },

  async getSeatLock(eventId, seatId) {
    const r = getRedis();
    if (!r) return null;
    return await r.get(`seat:lock:${eventId}:${seatId}`);
  },

  async publish(channel, data) {
    const r = getRedis();
    if (!r) return;
    try {
      await r.publish(channel, JSON.stringify(data));
    } catch { /* ignore */ }
  }
};

module.exports = { getRedis, cache };
