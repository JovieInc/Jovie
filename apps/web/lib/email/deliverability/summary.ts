/**
 * Per-stream and per-domain deliverability from Resend webhook outcomes
 * (notification_delivery_log rows carry `stream` and `senderDomain`).
 * Pure: the server loader runs the query, this module judges it against the
 * thresholds in stream-registry.json.
 *
 *   bounceRate     = bounced / (delivered + bounced)
 *   complaintRate  = complained / delivered
 *
 * Below `minSample` outcomes a rate is reported but not judged. Above a
 * stream's `*Rate` threshold the status is `warn` (incident to Summer);
 * above `*RatePause` it is `pause` (pausable streams stop sending).
 * Gmail/Yahoo bulk-sender line: complaints under 0.1%, never 0.3%.
 */
import {
  EMAIL_STREAM_REGISTRY,
  EMAIL_STREAMS,
  type EmailStream,
  isEmailStream,
  type StreamEnv,
  streamForSenderDomain,
  streamPolicy,
} from '../streams';

export const DELIVERABILITY_SCHEMA = 'jovie.email-deliverability/v2';

export interface OutcomeRow {
  readonly stream: string | null;
  readonly senderDomain: string | null;
  readonly status: string;
  readonly count: number;
}

export type HealthStatus = 'ok' | 'warn' | 'pause' | 'insufficient-data';

export interface Rates {
  readonly delivered: number;
  readonly bounced: number;
  readonly complained: number;
  readonly bounceRate: number | null;
  readonly complaintRate: number | null;
}

export interface StreamHealth extends Rates {
  readonly stream: EmailStream | 'unattributed';
  readonly domains: readonly string[];
  readonly status: HealthStatus;
  readonly breaches: readonly string[];
}

export interface DomainHealth extends Rates {
  readonly domain: string;
  readonly streams: readonly (EmailStream | 'unattributed')[];
}

interface Counter {
  delivered: number;
  bounced: number;
  complained: number;
}

const pct = (n: number, digits = 2) => `${(n * 100).toFixed(digits)}%`;

function rates(c: Counter, minSample: number): Rates {
  const outcomes = c.delivered + c.bounced;
  return {
    ...c,
    bounceRate: outcomes >= minSample ? c.bounced / outcomes : null,
    complaintRate:
      outcomes >= minSample ? c.complained / Math.max(c.delivered, 1) : null,
  };
}

function bump(counter: Counter, status: string, count: number) {
  if (status === 'delivered') counter.delivered += count;
  else if (status === 'bounced') counter.bounced += count;
  else if (status === 'complained') counter.complained += count;
}

export function judge(
  stream: EmailStream | 'unattributed',
  r: Rates
): { status: HealthStatus; breaches: string[] } {
  if (r.bounceRate === null || r.complaintRate === null) {
    return { status: 'insufficient-data', breaches: [] };
  }
  // Unattributed mail is judged by the strictest (transactional) limits.
  const limits = streamPolicy(
    stream === 'unattributed' ? 'transactional' : stream
  ).thresholds;
  const breaches: string[] = [];
  let status: HealthStatus = 'ok';
  if (r.complaintRate > limits.complaintRatePause) {
    breaches.push(
      `complaints ${pct(r.complaintRate, 3)} > pause line ${pct(limits.complaintRatePause, 1)}`
    );
    status = 'pause';
  } else if (r.complaintRate > limits.complaintRate) {
    breaches.push(
      `complaints ${pct(r.complaintRate, 3)} > ${pct(limits.complaintRate, 1)}`
    );
    status = 'warn';
  }
  if (r.bounceRate > limits.bounceRatePause) {
    breaches.push(
      `bounces ${pct(r.bounceRate)} > pause line ${pct(limits.bounceRatePause, 0)}`
    );
    status = 'pause';
  } else if (r.bounceRate > limits.bounceRate) {
    breaches.push(
      `bounces ${pct(r.bounceRate)} > ${pct(limits.bounceRate, 0)}`
    );
    if (status === 'ok') status = 'warn';
  }
  return { status, breaches };
}

export function summarizeDeliverability(
  rows: readonly OutcomeRow[],
  options: {
    readonly env: StreamEnv;
    readonly now: Date;
    readonly windowDays?: number;
    readonly minSample?: number;
    readonly forgeEligible?: boolean | null;
  }
) {
  const windowDays =
    options.windowDays ?? EMAIL_STREAM_REGISTRY.deliverability.windowDays;
  const minSample =
    options.minSample ?? EMAIL_STREAM_REGISTRY.deliverability.minSample;
  const byStream = new Map<EmailStream | 'unattributed', Counter>();
  const streamDomains = new Map<string, Set<string>>();
  const byDomain = new Map<string, Counter>();
  const domainStreams = new Map<string, Set<EmailStream | 'unattributed'>>();

  for (const row of rows) {
    const domain = row.senderDomain ?? 'unknown';
    const tagged = isEmailStream(row.stream) ? row.stream : null;
    const inferred = row.senderDomain
      ? streamForSenderDomain(row.senderDomain, options.env)
      : 'unknown';
    const stream: EmailStream | 'unattributed' =
      tagged ?? (inferred === 'unknown' ? 'unattributed' : inferred);
    const sc = byStream.get(stream) ?? {
      delivered: 0,
      bounced: 0,
      complained: 0,
    };
    bump(sc, row.status, row.count);
    byStream.set(stream, sc);
    const dc = byDomain.get(domain) ?? {
      delivered: 0,
      bounced: 0,
      complained: 0,
    };
    bump(dc, row.status, row.count);
    byDomain.set(domain, dc);
    (
      streamDomains.get(stream) ??
      streamDomains.set(stream, new Set()).get(stream)
    )?.add(domain);
    (
      domainStreams.get(domain) ??
      domainStreams.set(domain, new Set()).get(domain)
    )?.add(stream);
  }

  const streams: StreamHealth[] = [];
  for (const [stream, counter] of byStream) {
    const r = rates(counter, minSample);
    streams.push({
      stream,
      domains: [...(streamDomains.get(stream) ?? [])].sort(),
      ...r,
      ...judge(stream, r),
    });
  }
  streams.sort((a, b) => a.stream.localeCompare(b.stream));

  const domains: DomainHealth[] = [...byDomain.entries()]
    .map(([domain, counter]) => ({
      domain,
      streams: [...(domainStreams.get(domain) ?? [])].sort(),
      ...rates(counter, minSample),
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));

  return {
    schema: DELIVERABILITY_SCHEMA,
    generatedAt: options.now.toISOString(),
    windowDays,
    minSample,
    streams,
    domains,
    forge: forgeReadiness(streams, options.forgeEligible ?? null),
    ok: streams.every(
      s => s.status === 'ok' || s.status === 'insufficient-data'
    ),
  };
}

/**
 * Resend Forge readiness: Resend must call us eligible (forgeEligible), and
 * every live stream must be clean on real volume. Both true means Summer
 * files the one-tap activation card to Tim; nothing activates by itself.
 */
export function forgeReadiness(
  streams: readonly StreamHealth[],
  forgeEligible: boolean | null
) {
  const rule = EMAIL_STREAM_REGISTRY.deliverability.forge.readyWhen;
  const live = streams.filter(s => s.stream !== 'unattributed');
  const blockers: string[] = [];
  if (forgeEligible !== true) {
    blockers.push(
      forgeEligible === false
        ? 'Resend does not list the account as Forge-eligible'
        : 'Forge eligibility unknown (weekly Summer check)'
    );
  }
  if (live.length === 0) blockers.push('no attributed sending volume yet');
  for (const s of live) {
    if (s.delivered < rule.minDeliveredPerStream)
      blockers.push(
        `${s.stream}: ${s.delivered} delivered < ${rule.minDeliveredPerStream}`
      );
    if (s.bounceRate === null || s.bounceRate > rule.maxBounceRate)
      blockers.push(
        `${s.stream}: bounce rate not under ${pct(rule.maxBounceRate, 0)}`
      );
    if (s.complaintRate === null || s.complaintRate > rule.maxComplaintRate)
      blockers.push(
        `${s.stream}: complaint rate not under ${pct(rule.maxComplaintRate, 1)}`
      );
  }
  return { ready: blockers.length === 0, blockers };
}

export { EMAIL_STREAMS };
