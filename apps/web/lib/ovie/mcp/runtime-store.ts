import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import {
  DurableOperatingStore,
  FailoverOperatingStore,
  type OperatingStore,
  OVIE_MCP_INDEX_CAP,
  OVIE_MCP_RECORD_TTL_SECONDS,
  type RecordBackend,
} from '@/lib/ovie/mcp/store';
import { getRedis } from '@/lib/redis';
import { classifyRedisFailure } from '@/lib/redis-operability';

const REDIS_QUOTA_SKIP_MS = 15 * 60_000;
const REDIS_UNAVAILABLE_SKIP_MS = 30_000;
let skipRedisUntil = 0;

function redisRecordBackend(
  redis: NonNullable<ReturnType<typeof getRedis>>
): RecordBackend {
  return {
    get: async key => redis.get(key),
    set: async (key, value) => {
      await redis.set(key, value, { ex: OVIE_MCP_RECORD_TTL_SECONDS });
    },
    lpush: async (key, value) => {
      await redis.lpush(key, value);
      await redis.ltrim(key, 0, OVIE_MCP_INDEX_CAP - 1);
    },
    lrange: async (key, start, stop) => {
      const rows = await redis.lrange(key, start, stop);
      return Array.isArray(rows) ? rows.map(String) : [];
    },
  };
}

function postgresOperatingStore(): OperatingStore {
  return new DurableOperatingStore(postgresRecordBackend());
}

/** Same Redis+Postgres failover store MCP create_initiative uses. */
export function getOvieOperatingStore(): OperatingStore {
  const fallback = postgresOperatingStore();
  if (Date.now() < skipRedisUntil) return fallback;
  const redis = getRedis();
  if (!redis) return fallback;
  return new FailoverOperatingStore({
    primary: new DurableOperatingStore(redisRecordBackend(redis)),
    fallback,
    writeThrough: true,
    isPrimaryFailure(error) {
      const kind = classifyRedisFailure(error);
      return kind === 'quota_exceeded' || kind === 'unavailable';
    },
    onPrimaryFailure(error) {
      const kind = classifyRedisFailure(error);
      skipRedisUntil =
        Date.now() +
        (kind === 'quota_exceeded'
          ? REDIS_QUOTA_SKIP_MS
          : REDIS_UNAVAILABLE_SKIP_MS);
    },
  });
}
