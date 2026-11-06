import 'server-only';

import { sql as drizzleSql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pauseStream } from '@/lib/email/gateway/pause.server';
import { captureError } from '@/lib/error-tracking';
import { summerCardId } from '@/lib/ovie/summer-card-digest';
import { submitSummerCard } from '@/lib/ovie/summer-cards.server';
import { logger } from '@/lib/utils/logger';
import {
  EMAIL_STREAM_REGISTRY,
  type EmailStream,
  isEmailStream,
  streamPolicy,
} from '../streams';
import {
  type OutcomeRow,
  type StreamHealth,
  summarizeDeliverability,
} from './summary';

/**
 * The closed deliverability loop, event-driven: every bounce or complaint
 * webhook re-judges its stream over the registry window. A stream over its
 * pause line stops (pausable streams) and Summer gets an Ovie card; approving
 * the card resumes the stream. Over the warn line, Summer gets an incident
 * card and nothing stops. Transactional never pauses (sign-in must work).
 */

export async function loadOutcomeRows(
  windowDays = EMAIL_STREAM_REGISTRY.deliverability.windowDays
): Promise<OutcomeRow[]> {
  // Opens and clicks are also logged as `delivered`; count real outcomes only.
  const result = await db.execute(drizzleSql`
    SELECT metadata->>'stream' AS "stream",
           metadata->>'senderDomain' AS "senderDomain",
           status::text AS status,
           count(*)::int AS count
    FROM notification_delivery_log
    WHERE channel = 'email'
      AND status IN ('delivered', 'bounced', 'complained')
      AND metadata->>'engagementType' IS NULL
      AND created_at > now() - make_interval(days => ${windowDays})
    GROUP BY 1, 2, 3
  `);
  return (result.rows ?? result) as unknown as OutcomeRow[];
}

export async function loadDeliverability(
  now = new Date(),
  forgeEligible: boolean | null = null
) {
  return summarizeDeliverability(await loadOutcomeRows(), {
    env: process.env,
    now,
    forgeEligible,
  });
}

/** Pause cards key per hour (a re-breach after a resume can pause again); incidents per day. */
function period(now: Date, pause: boolean): string {
  return now
    .toISOString()
    .slice(0, pause ? 13 : 10)
    .replaceAll(/[-T:]/g, '');
}

function cardBody(health: StreamHealth, action: string): string {
  const rate = (n: number | null) =>
    n === null ? 'n/a' : `${(n * 100).toFixed(3)}%`;
  return [
    `Stream: ${health.stream} (${health.domains.join(', ') || 'no domain'})`,
    `Window: ${EMAIL_STREAM_REGISTRY.deliverability.windowDays} days`,
    `Delivered ${health.delivered}, bounced ${health.bounced}, complained ${health.complained}`,
    `Bounce rate ${rate(health.bounceRate)}, complaint rate ${rate(health.complaintRate)}`,
    `Breaches: ${health.breaches.join('; ')}`,
    '',
    action,
    'Limits: Gmail/Yahoo bulk senders keep complaints under 0.1% and never reach 0.3%; Resend expects bounces under 4%.',
    'Source: Resend webhooks -> notification_delivery_log; registry apps/web/lib/email/stream-registry.json.',
  ].join('\n');
}

export type StreamLoopOutcome =
  | 'ok'
  | 'insufficient-data'
  | 'incident-filed'
  | 'paused'
  | 'already-paused';

/** Re-judge one stream and act. Safe to call on every webhook (idempotent per day). */
export async function evaluateStream(
  stream: EmailStream,
  now = new Date()
): Promise<StreamLoopOutcome> {
  const summary = summarizeDeliverability(await loadOutcomeRows(), {
    env: process.env,
    now,
  });
  const health = summary.streams.find(s => s.stream === stream);
  if (!health || health.status === 'insufficient-data')
    return 'insufficient-data';
  if (health.status === 'ok') return 'ok';

  const policy = streamPolicy(stream);
  const pause = health.status === 'pause' && policy.pausable;
  const key = `email-${pause ? 'pause' : 'incident'}-${stream}-${period(now, pause)}`;
  const submission = await submitSummerCard({
    idempotencyKey: key,
    kind: 'decision',
    product: 'jov',
    title: pause
      ? `Email stream "${stream}" paused: deliverability over the line`
      : `Email stream "${stream}" deliverability incident`,
    body: cardBody(
      health,
      pause
        ? 'The gateway stopped this stream. Find the cause (list hygiene, a bad template, a send to non-opted-in people) before resuming. Approving this card resumes the stream.'
        : stream === 'transactional'
          ? 'Transactional never pauses (sign-in codes and receipts must go out). Find the cause now: a complaint spike here burns send.jov.ie for every stream.'
          : 'Over the warning line, under the pause line. Find the cause before it reaches the pause line.'
    ),
    recommendation: pause
      ? 'Keep paused until the cause is fixed, then approve to resume.'
      : 'Investigate the cause today.',
    defaultIfSilent: pause
      ? 'Stays paused. Silence never resumes a stream.'
      : 'No action; the loop re-checks on every bounce or complaint.',
    recipient: null,
    amountUsd: null,
    preflightReceiptId: null,
    evidence: [],
    decideBy: null,
    defaultDecision: 'none',
  });
  if (submission.outcome === 'conflict') {
    logger.warn('email_deliverability_card_conflict', { stream, key });
  }
  if (!pause) return 'incident-filed';

  const created = await pauseStream({
    stream,
    pausedAt: now.toISOString(),
    reason: health.breaches.join('; '),
    resumeCardId: summerCardId(key),
  });
  logger.warn('email_stream_paused', {
    stream,
    breaches: health.breaches,
    created,
  });
  return created ? 'paused' : 'already-paused';
}

/** Webhook hook: best effort, never fails the webhook delivery. */
export async function evaluateStreamFromEvent(
  stream: string | null | undefined
): Promise<void> {
  const target: EmailStream = isEmailStream(stream) ? stream : 'transactional';
  try {
    await evaluateStream(target);
  } catch (error) {
    await captureError('[email-deliverability] evaluation failed', error, {
      stream: target,
    });
  }
}
