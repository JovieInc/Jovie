import 'server-only';

import { getRedis } from '@/lib/redis';
import {
  HELP_CENTER_SCHEMA_VERSION,
  type HelpCenterEventPayload,
} from '@/lib/tracking/help-center-contract';

export class HelpCenterStoreUnavailableError extends Error {
  constructor() {
    super('Help Center analytics store unavailable');
    this.name = 'HelpCenterStoreUnavailableError';
  }
}

export const HELP_CENTER_RETENTION_DAYS = 90;
export const HELP_CENTER_DEDUP_TTL_SECONDS = 24 * 60 * 60;

const KEY_PREFIX = `help-center:v${HELP_CENTER_SCHEMA_VERSION}`;
const RETENTION_SECONDS = HELP_CENTER_RETENTION_DAYS * 24 * 60 * 60;

const keys = {
  dedupe: (eventId: string) => `${KEY_PREFIX}:dedupe:${eventId}`,
  topQueries: `${KEY_PREFIX}:top-queries`,
  zeroResults: `${KEY_PREFIX}:zero-results`,
  articleFeedback: (articleId: string) =>
    `${KEY_PREFIX}:article-feedback:${articleId}`,
  articleIndex: `${KEY_PREFIX}:articles`,
  escalations: `${KEY_PREFIX}:escalations`,
} as const;

function requireRedis() {
  const redis = getRedis();
  if (!redis) throw new HelpCenterStoreUnavailableError();
  return redis;
}

/**
 * Record a validated batch as aggregates only. Event ids dedupe for 24h so a
 * retried beacon cannot double-count; nothing identifiable is stored.
 */
export async function recordHelpCenterEvents(
  events: readonly HelpCenterEventPayload[]
): Promise<{ accepted: number; duplicates: number }> {
  const redis = requireRedis();
  let accepted = 0;
  let duplicates = 0;

  for (const event of events) {
    const isNew = await redis.set(keys.dedupe(event.event_id), 1, {
      nx: true,
      ex: HELP_CENTER_DEDUP_TTL_SECONDS,
    });
    if (isNew !== 'OK') {
      duplicates += 1;
      continue;
    }
    accepted += 1;

    const pipeline = redis.pipeline();
    switch (event.event) {
      case 'search_query_submitted':
        if (event.query_hash)
          pipeline.zincrby(keys.topQueries, 1, event.query_hash);
        break;
      case 'search_zero_results':
        if (event.query_hash)
          pipeline.zincrby(keys.zeroResults, 1, event.query_hash);
        break;
      case 'article_feedback':
        if (event.article_id && event.feedback) {
          pipeline.hincrby(
            keys.articleFeedback(event.article_id),
            event.feedback,
            1
          );
          pipeline.expire(
            keys.articleFeedback(event.article_id),
            RETENTION_SECONDS
          );
          pipeline.sadd(keys.articleIndex, event.article_id);
        }
        break;
      case 'support_escalation':
      case 'contact_support_opened':
      case 'support_request_submitted':
      case 'support_request_failed':
        pipeline.zincrby(
          keys.escalations,
          1,
          `${event.event}:${event.article_id ?? 'none'}:${
            event.source_surface ?? 'unknown'
          }`
        );
        break;
      default:
        break;
    }
    pipeline.expire(keys.topQueries, RETENTION_SECONDS);
    pipeline.expire(keys.zeroResults, RETENTION_SECONDS);
    pipeline.expire(keys.escalations, RETENTION_SECONDS);
    await pipeline.exec();
  }

  return { accepted, duplicates };
}
