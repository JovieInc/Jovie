import 'server-only';

import { CACHE_TTL } from '@/lib/cache/tags';
import { getRedis } from '@/lib/redis';
import type { AskJovieAnswer } from './answer';

export type AskJovieCacheStatus = 'hit' | 'miss' | 'bypass' | 'unavailable';

export interface CachedAskJovieAnswer {
  readonly answer: AskJovieAnswer;
  readonly cacheStatus: AskJovieCacheStatus;
}

function isCurrentCachedAnswer(
  value: unknown,
  candidate: AskJovieAnswer,
  cacheKey: string
): value is AskJovieAnswer {
  if (!value || typeof value !== 'object') return false;
  const cached = value as Partial<AskJovieAnswer>;
  return (
    cached.kind === 'answer' &&
    cached.provenance?.cacheKey === cacheKey &&
    cached.provenance.sourceRevision === candidate.provenance.sourceRevision
  );
}

/**
 * Cache only normalized deterministic answer objects. The key is produced by
 * the answer engine from profile + intent + entity ids + source revision, so
 * raw visitor prose is never retained and a new canonical entity revision can
 * never resolve to an older "latest" answer.
 */
export async function cacheAskJovieAnswer(
  candidate: AskJovieAnswer
): Promise<CachedAskJovieAnswer> {
  const cacheKey = candidate.provenance.cacheKey;
  if (candidate.kind !== 'answer' || !cacheKey) {
    return { answer: candidate, cacheStatus: 'bypass' };
  }

  const redis = getRedis();
  if (!redis) {
    return { answer: candidate, cacheStatus: 'unavailable' };
  }

  try {
    const cached = await redis.get<unknown>(cacheKey);
    if (isCurrentCachedAnswer(cached, candidate, cacheKey)) {
      return { answer: cached, cacheStatus: 'hit' };
    }
    await redis.set(cacheKey, candidate, { ex: CACHE_TTL.LONG });
    return { answer: candidate, cacheStatus: 'miss' };
  } catch {
    // Structured resolution remains fully useful when cache capacity is down.
    return { answer: candidate, cacheStatus: 'unavailable' };
  }
}
