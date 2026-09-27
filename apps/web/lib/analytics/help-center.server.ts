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

/**
 * Volume/confidence thresholds for remediation candidates. A signal must
 * repeat before it can become a Linear issue, and candidate keys are
 * deterministic so issue creation dedupes by construction rather than by
 * one-issue-per-event.
 */
export const HELP_CENTER_ZERO_RESULT_THRESHOLD = 3;
export const HELP_CENTER_LOW_HELPFULNESS_MIN_RATINGS = 3;
export const HELP_CENTER_LOW_HELPFULNESS_RATIO = 0.5;
export const HELP_CENTER_ESCALATION_THRESHOLD = 3;

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

export interface RemediationCandidate {
  /** Deterministic dedupe key — one Linear issue per key, ever. */
  readonly candidate_key: string;
  readonly kind:
    | 'content_gap'
    | 'content_quality'
    | 'product_defect_or_support_gap';
  readonly subject: string;
  readonly count: number;
  readonly evidence: Record<string, number | string>;
}

export interface HelpCenterSignals {
  readonly top_queries: ReadonlyArray<{ query_hash: string; count: number }>;
  readonly zero_result_queries: ReadonlyArray<{
    query_hash: string;
    count: number;
  }>;
  readonly article_helpfulness: ReadonlyArray<{
    article_id: string;
    helpful: number;
    not_helpful: number;
    ratio_not_helpful: number;
  }>;
  readonly escalations: ReadonlyArray<{
    context: string;
    count: number;
  }>;
  readonly remediation_candidates: readonly RemediationCandidate[];
}

function requireRedis() {
  const redis = getRedis();
  if (!redis) throw new HelpCenterStoreUnavailableError();
  return redis;
}

/**
 * Record a validated batch as aggregates only. Event ids dedupe for 24h so a
 * retried beacon cannot double-count; nothing enumerable or identifiable is
 * stored.
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

function parseScoredPairs(
  raw: unknown
): Array<{ member: string; count: number }> {
  if (!Array.isArray(raw)) return [];
  const pairs: Array<{ member: string; count: number }> = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const count = Number(raw[i + 1]);
    if (typeof raw[i] === 'string' && Number.isFinite(count)) {
      pairs.push({ member: raw[i], count });
    }
  }
  return pairs;
}

export function deriveRemediationCandidates(signals: {
  zeroResultQueries: ReadonlyArray<{ query_hash: string; count: number }>;
  articleHelpfulness: ReadonlyArray<{
    article_id: string;
    helpful: number;
    not_helpful: number;
    ratio_not_helpful: number;
  }>;
  escalations: ReadonlyArray<{ context: string; count: number }>;
}): RemediationCandidate[] {
  const candidates: RemediationCandidate[] = [];

  for (const query of signals.zeroResultQueries) {
    if (query.count < HELP_CENTER_ZERO_RESULT_THRESHOLD) continue;
    candidates.push({
      candidate_key: `help-center:zero-result:${query.query_hash}`,
      kind: 'content_gap',
      subject: `Repeated zero-result help search (${query.query_hash})`,
      count: query.count,
      evidence: {
        query_hash: query.query_hash,
        zero_result_count: query.count,
        threshold: HELP_CENTER_ZERO_RESULT_THRESHOLD,
      },
    });
  }

  for (const article of signals.articleHelpfulness) {
    const total = article.helpful + article.not_helpful;
    if (
      article.not_helpful < HELP_CENTER_LOW_HELPFULNESS_MIN_RATINGS ||
      article.ratio_not_helpful < HELP_CENTER_LOW_HELPFULNESS_RATIO
    ) {
      continue;
    }
    candidates.push({
      candidate_key: `help-center:low-helpfulness:${article.article_id}`,
      kind: 'content_quality',
      subject: `Low-helpfulness article: ${article.article_id}`,
      count: article.not_helpful,
      evidence: {
        article_id: article.article_id,
        helpful: article.helpful,
        not_helpful: article.not_helpful,
        total_ratings: total,
      },
    });
  }

  for (const escalation of signals.escalations) {
    if (escalation.count < HELP_CENTER_ESCALATION_THRESHOLD) continue;
    candidates.push({
      candidate_key: `help-center:escalation:${escalation.context}`,
      kind: 'product_defect_or_support_gap',
      subject: `Repeated support escalations (${escalation.context})`,
      count: escalation.count,
      evidence: {
        context: escalation.context,
        escalation_count: escalation.count,
        threshold: HELP_CENTER_ESCALATION_THRESHOLD,
      },
    });
  }

  return candidates;
}

/** The four closed-loop views plus deduplicated remediation candidates. */
export async function getHelpCenterSignals(
  topN = 20
): Promise<HelpCenterSignals> {
  const redis = requireRedis();

  const [topQueriesRaw, zeroResultsRaw, escalationsRaw, articleIds] =
    await Promise.all([
      redis.zrange(keys.topQueries, 0, topN - 1, {
        rev: true,
        withScores: true,
      }),
      redis.zrange(keys.zeroResults, 0, topN - 1, {
        rev: true,
        withScores: true,
      }),
      redis.zrange(keys.escalations, 0, topN - 1, {
        rev: true,
        withScores: true,
      }),
      redis.smembers(keys.articleIndex),
    ]);

  const topQueries = parseScoredPairs(topQueriesRaw).map(pair => ({
    query_hash: pair.member,
    count: pair.count,
  }));
  const zeroResultQueries = parseScoredPairs(zeroResultsRaw).map(pair => ({
    query_hash: pair.member,
    count: pair.count,
  }));
  const escalations = parseScoredPairs(escalationsRaw).map(pair => ({
    context: pair.member,
    count: pair.count,
  }));

  const articleHelpfulness: Array<{
    article_id: string;
    helpful: number;
    not_helpful: number;
    ratio_not_helpful: number;
  }> = [];
  for (const articleId of articleIds.slice(0, 200)) {
    const counts = await redis.hgetall<Record<string, string>>(
      keys.articleFeedback(articleId)
    );
    const helpful = Number(counts?.helpful ?? 0);
    const notHelpful = Number(counts?.not_helpful ?? 0);
    const total = helpful + notHelpful;
    articleHelpfulness.push({
      article_id: articleId,
      helpful,
      not_helpful: notHelpful,
      ratio_not_helpful: total ? notHelpful / total : 0,
    });
  }
  articleHelpfulness.sort(
    (a, b) =>
      b.ratio_not_helpful - a.ratio_not_helpful || b.not_helpful - a.not_helpful
  );

  return {
    top_queries: topQueries,
    zero_result_queries: zeroResultQueries,
    article_helpfulness: articleHelpfulness,
    escalations,
    remediation_candidates: deriveRemediationCandidates({
      zeroResultQueries,
      articleHelpfulness,
      escalations,
    }),
  };
}
