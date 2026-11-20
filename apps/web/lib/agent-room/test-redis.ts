import type { AgentRoomRedis } from './store.server';

/** In-memory hash store with the AgentRoomRedis surface, for tests. */
export function memoryRoomRedis(): AgentRoomRedis & {
  readonly hashes: Map<string, Map<string, string>>;
} {
  const hashes = new Map<string, Map<string, string>>();
  const hash = (key: string) => {
    let value = hashes.get(key);
    if (!value) {
      value = new Map();
      hashes.set(key, value);
    }
    return value;
  };
  return {
    hashes,
    async hset(key, fields) {
      for (const [field, value] of Object.entries(fields))
        hash(key).set(field, value);
      return Object.keys(fields).length;
    },
    async hgetall<T extends Record<string, unknown>>(key: string) {
      const value = hashes.get(key);
      return value ? (Object.fromEntries(value) as T) : null;
    },
    async hdel(key, ...fields) {
      let removed = 0;
      for (const field of fields) if (hash(key).delete(field)) removed += 1;
      return removed;
    },
    async hlen(key) {
      return hashes.get(key)?.size ?? 0;
    },
  };
}
