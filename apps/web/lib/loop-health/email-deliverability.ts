/**
 * Email deliverability signal for the closed-loop health contract
 * (scripts/loops/email-deliverability.mjs).
 *
 * Reads Resend webhook events already stored in webhook_events (the Resend
 * webhook route persists every event type) and returns aggregate counts and
 * rates over a rolling window. No addresses, ids or message bodies leave this
 * module: the cron route returns numbers only.
 */
import { sql as drizzleSql } from 'drizzle-orm';
import { withSystemIngestionSession } from '@/lib/ingestion/session';

export const EMAIL_WINDOW_DAYS = 7;
/** Sign-in and verification mail, identified by the subject Resend echoes. */
export const AUTH_MAIL_SUBJECT_PATTERN =
  '(verification|verify|sign.?in|log.?in|one-time|passcode|code)';

export interface EmailEventCounts {
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
}

export interface EmailDeliverabilityMetrics {
  windowDays: number;
  attempts7d: number;
  bounced7d: number;
  complaints7d: number;
  bounceRatePct: number | null;
  complaintRatePct: number | null;
  /** p95 seconds from email.sent to email.delivered for auth mail. */
  deliveryLatencyP95Sec: number | null;
  latencySamples7d: number;
}

const round = (value: number, places = 3) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/**
 * Attempts are the larger of provider "sent" events and the terminal outcomes
 * seen (delivered + bounced), so a webhook subscription that omits email.sent
 * still yields a denominator instead of a divide-by-zero.
 */
export function computeEmailMetrics(
  counts: EmailEventCounts,
  latency: { p95Sec: number | null; samples: number }
): EmailDeliverabilityMetrics {
  const attempts = Math.max(counts.sent, counts.delivered + counts.bounced);
  return {
    windowDays: EMAIL_WINDOW_DAYS,
    attempts7d: attempts,
    bounced7d: counts.bounced,
    complaints7d: counts.complained,
    bounceRatePct:
      attempts > 0 ? round((counts.bounced / attempts) * 100) : null,
    complaintRatePct:
      attempts > 0 ? round((counts.complained / attempts) * 100) : null,
    deliveryLatencyP95Sec:
      latency.samples > 0 && latency.p95Sec !== null
        ? round(latency.p95Sec, 1)
        : null,
    latencySamples7d: latency.samples,
  };
}

const num = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function loadEmailDeliverabilityMetrics(
  now = new Date()
): Promise<EmailDeliverabilityMetrics> {
  const since = new Date(now.getTime() - EMAIL_WINDOW_DAYS * 86_400_000);
  return withSystemIngestionSession(async tx => {
    const countRows = await tx.execute(drizzleSql`
      SELECT event_type, count(*)::int AS n
      FROM webhook_events
      WHERE provider = 'resend'
        AND created_at >= ${since.toISOString()}
        AND event_type IN ('email.sent', 'email.delivered', 'email.bounced', 'email.complained')
      GROUP BY event_type
    `);
    const latencyRows = await tx.execute(drizzleSql`
      WITH sent AS (
        SELECT payload->'data'->>'email_id' AS id, min(created_at) AS t
        FROM webhook_events
        WHERE provider = 'resend' AND event_type = 'email.sent'
          AND created_at >= ${since.toISOString()}
        GROUP BY 1
      ), delivered AS (
        SELECT payload->'data'->>'email_id' AS id, min(created_at) AS t,
               max(payload->'data'->>'subject') AS subject
        FROM webhook_events
        WHERE provider = 'resend' AND event_type = 'email.delivered'
          AND created_at >= ${since.toISOString()}
        GROUP BY 1
      )
      SELECT count(*)::int AS samples,
             percentile_cont(0.95) WITHIN GROUP (
               ORDER BY extract(epoch FROM (delivered.t - sent.t))
             ) AS p95
      FROM sent JOIN delivered USING (id)
      WHERE delivered.t >= sent.t
        AND delivered.subject ~* ${AUTH_MAIL_SUBJECT_PATTERN}
    `);
    const byType = new Map<string, number>();
    for (const row of countRows.rows as Array<Record<string, unknown>>) {
      byType.set(String(row.event_type), num(row.n));
    }
    const latency = (latencyRows.rows as Array<Record<string, unknown>>)[0];
    return computeEmailMetrics(
      {
        sent: byType.get('email.sent') ?? 0,
        delivered: byType.get('email.delivered') ?? 0,
        bounced: byType.get('email.bounced') ?? 0,
        complained: byType.get('email.complained') ?? 0,
      },
      {
        p95Sec:
          latency?.p95 === null || latency?.p95 === undefined
            ? null
            : num(latency.p95),
        samples: num(latency?.samples),
      }
    );
  });
}
