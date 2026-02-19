import 'server-only';

import crypto from 'node:crypto';

import { env } from '@/lib/env-server';
import { createRateLimiter } from '@/lib/rate-limit/rate-limiter';
import { getRedis } from '@/lib/redis';
import { logger } from '@/lib/utils/logger';

const MUSICFETCH_API_BASE = 'https://api.musicfetch.io';
const MAX_RETRY_ATTEMPTS = 3;
const DEDUP_LOCK_TTL_SECONDS = 20;
const DEDUP_RESULT_TTL_SECONDS = 20;

const requestRateLimiter = createRateLimiter({
  name: 'musicfetch',
  limit: 6,
  window: '1 m',
  prefix: 'rl:musicfetch',
  analytics: true,
});

const inFlightRequests = new Map<string, Promise<unknown>>();

export class MusicfetchRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'MusicfetchRequestError';
  }
}

interface MusicfetchRequestOptions {
  timeoutMs: number;
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number.parseInt(value, 10);
  if (!Number.isNaN(seconds) && seconds > 0) return seconds;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  const deltaMs = date.getTime() - Date.now();
  if (deltaMs <= 0) return undefined;

  return Math.ceil(deltaMs / 1000);
}

function backoffMs(attempt: number, retryAfterSeconds?: number): number {
  const base = retryAfterSeconds
    ? retryAfterSeconds * 1000
    : 400 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

async function delay(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function withRedisDedup<T>(
  dedupKey: string,
  request: () => Promise<T>
): Promise<T> {
  const redis = getRedis();
  if (!redis) return request();

  const lockKey = `musicfetch:lock:${dedupKey}`;
  const resultKey = `musicfetch:result:${dedupKey}`;

  const cached = await redis.get<string>(resultKey);
  if (cached) {
    return JSON.parse(cached) as T;
  }

  const owner = crypto.randomUUID();
  const acquired = await redis.set(lockKey, owner, {
    nx: true,
    ex: DEDUP_LOCK_TTL_SECONDS,
  });

  if (acquired === 'OK') {
    try {
      const response = await request();
      await redis.set(resultKey, JSON.stringify(response), {
        ex: DEDUP_RESULT_TTL_SECONDS,
      });
      return response;
    } finally {
      const currentOwner = await redis.get<string>(lockKey);
      if (currentOwner === owner) {
        await redis.del(lockKey);
      }
    }
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < DEDUP_LOCK_TTL_SECONDS * 1000) {
    await delay(250);
    const result = await redis.get<string>(resultKey);
    if (result) {
      return JSON.parse(result) as T;
    }
  }

  logger.warn('MusicFetch dedup wait timed out, issuing direct request', {
    dedupKey,
  });
  return request();
}

async function requestWithRetries<T>(
  endpoint: string,
  params: URLSearchParams,
  options: MusicfetchRequestOptions
): Promise<T> {
  const token = env.MUSICFETCH_API_TOKEN;
  if (!token) {
    throw new MusicfetchRequestError('MusicFetch API token is not configured');
  }

  const query = params.toString();
  const url = `${MUSICFETCH_API_BASE}${endpoint}?${query}`;

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    const rateLimit = await requestRateLimiter.limit('global');
    if (!rateLimit.success) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((rateLimit.reset.getTime() - Date.now()) / 1000)
      );
      throw new MusicfetchRequestError(
        'MusicFetch local/global rate limit exceeded',
        429,
        retryAfterSeconds
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'x-token': token,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      const retryAfterSeconds = parseRetryAfterSeconds(
        response.headers.get('retry-after')
      );

      if (response.status === 429 || response.status >= 500) {
        if (attempt < MAX_RETRY_ATTEMPTS - 1) {
          await delay(backoffMs(attempt, retryAfterSeconds));
          continue;
        }
      }

      throw new MusicfetchRequestError(
        `MusicFetch API error: ${response.status}`,
        response.status,
        retryAfterSeconds
      );
    } catch (error) {
      if (error instanceof MusicfetchRequestError) {
        throw error;
      }

      if (attempt < MAX_RETRY_ATTEMPTS - 1) {
        await delay(backoffMs(attempt));
        continue;
      }

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new MusicfetchRequestError('MusicFetch request timed out');
      }

      throw new MusicfetchRequestError(
        error instanceof Error ? error.message : 'MusicFetch request failed'
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new MusicfetchRequestError('MusicFetch request failed after retries');
}

export async function musicfetchRequest<T>(
  endpoint: string,
  params: URLSearchParams,
  options: MusicfetchRequestOptions
): Promise<T> {
  const dedupKey = crypto
    .createHash('sha1')
    .update(`${endpoint}?${params.toString()}`)
    .digest('hex');

  const inFlight = inFlightRequests.get(dedupKey) as Promise<T> | undefined;
  if (inFlight) {
    return inFlight;
  }

  const requestPromise = withRedisDedup(dedupKey, () =>
    requestWithRetries<T>(endpoint, params, options)
  ).finally(() => {
    inFlightRequests.delete(dedupKey);
  });

  inFlightRequests.set(dedupKey, requestPromise);
  return requestPromise;
}
