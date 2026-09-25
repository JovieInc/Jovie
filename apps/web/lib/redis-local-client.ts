/**
 * Loopback Redis adapter for non-production rate limits and cache.
 * Command shapes match the Upstash client methods Jovie already calls.
 */

import type { RedisClientType } from 'redis';

type UpstashSetOptions = {
  ex?: number;
  px?: number;
  nx?: boolean;
};

type LocalRedisModule = {
  createClient: (options: { url: string }) => RedisClientType;
};

let clientPromise: Promise<RedisClientType> | null = null;
let clientUrl: string | null = null;

function serialize(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function deserialize(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function toScriptArgs(args: readonly unknown[]): string[] {
  return args.map(arg => (typeof arg === 'string' ? arg : String(arg)));
}

async function openLocalRedisClient(url: string): Promise<RedisClientType> {
  const { createClient } = (await import(
    'redis'
  )) as unknown as LocalRedisModule;
  const client = createClient({ url });
  client.on('error', error => {
    console.warn(
      '[redis] local Redis client error',
      error instanceof Error ? error.message : String(error)
    );
  });
  await client.connect();
  return client;
}

function getClient(url: string): Promise<RedisClientType> {
  if (clientPromise && clientUrl === url) return clientPromise;

  clientUrl = url;
  const settlement: {
    resolve: (client: RedisClientType) => void;
    reject: (error: unknown) => void;
  } = {
    resolve: () => undefined,
    reject: () => undefined,
  };
  const pending = new Promise<RedisClientType>((resolve, reject) => {
    settlement.resolve = resolve;
    settlement.reject = reject;
  });
  // Publish before the dynamic import. Concurrent first callers must share
  // this promise; assigning it after `await import('redis')` connects twice.
  clientPromise = pending;

  void openLocalRedisClient(url).then(settlement.resolve, (error: unknown) => {
    if (clientPromise === pending) {
      clientPromise = null;
      clientUrl = null;
    }
    settlement.reject(error);
  });

  return pending;
}

export function createLocalRedisClient(url: string) {
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const value = await (await getClient(url)).get(key);
      return deserialize(value) as T | null;
    },

    async set(
      key: string,
      value: unknown,
      options?: UpstashSetOptions
    ): Promise<'OK' | null> {
      const setOptions: {
        EX?: number;
        PX?: number;
        NX?: boolean;
      } = {};
      if (options?.ex !== undefined) setOptions.EX = options.ex;
      if (options?.px !== undefined) setOptions.PX = options.px;
      if (options?.nx) setOptions.NX = true;
      const result = await (await getClient(url)).set(
        key,
        serialize(value),
        setOptions
      );
      return result === 'OK' ? 'OK' : null;
    },

    async del(...keys: string[]): Promise<number> {
      if (keys.length === 0) return 0;
      return (await getClient(url)).del(keys);
    },

    async incr(key: string): Promise<number> {
      return (await getClient(url)).incr(key);
    },

    async expire(key: string, seconds: number): Promise<number> {
      const expired = await (await getClient(url)).expire(key, seconds);
      return expired ? 1 : 0;
    },

    async getdel<T = unknown>(key: string): Promise<T | null> {
      const value = await (await getClient(url)).getDel(key);
      return deserialize(value) as T | null;
    },

    async sadd(key: string, ...members: string[]): Promise<number> {
      if (members.length === 0) return 0;
      return (await getClient(url)).sAdd(key, members);
    },

    async mget<T = unknown>(...keys: string[]): Promise<Array<T | null>> {
      if (keys.length === 0) return [];
      const values = await (await getClient(url)).mGet(keys);
      return values.map(value => deserialize(value) as T | null);
    },

    async eval<T = unknown>(
      script: string,
      keys: string[],
      args: unknown[]
    ): Promise<T> {
      return (await getClient(url)).eval(script, {
        keys,
        arguments: toScriptArgs(args),
      }) as T;
    },

    async evalsha<T = unknown>(
      sha: string,
      keys: string[],
      args: unknown[]
    ): Promise<T> {
      try {
        return (await (
          await getClient(url)
        ).evalSha(sha, {
          keys,
          arguments: toScriptArgs(args),
        })) as T;
      } catch (error) {
        if (`${error}`.includes('NOSCRIPT')) {
          throw new Error(
            `NOSCRIPT ${error instanceof Error ? error.message : String(error)}`
          );
        }
        throw error;
      }
    },
  };
}

export function resetLocalRedisClientForTests(): void {
  clientPromise = null;
  clientUrl = null;
}
