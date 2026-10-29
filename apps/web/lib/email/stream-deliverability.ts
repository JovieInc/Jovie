import {
  type EmailStream,
  findHardViolations,
  STREAM_THRESHOLDS,
  type StreamEnv,
  separationGaps,
  streamForSenderDomain,
} from './streams';

export const STREAM_DELIVERABILITY_SCHEMA = 'jovie.email-deliverability/v1';

export interface DeliveryCountRow {
  senderDomain: string | null;
  status: string;
  count: number;
}

export interface DomainDeliverability {
  domain: string;
  stream: EmailStream | 'unknown';
  delivered: number;
  bounced: number;
  complained: number;
  /** bounced / (delivered + bounced); null below the sample floor. */
  bounceRate: number | null;
  /** complained / delivered; null below the sample floor. */
  complaintRate: number | null;
  status: 'ok' | 'breach' | 'insufficient-data';
  breaches: string[];
}

/** Below this many outcomes a rate is noise, so it is reported but not judged. */
export const MIN_SAMPLE = 50;

export function summarizeDeliverability(
  rows: readonly DeliveryCountRow[],
  source: StreamEnv,
  windowDays: number,
  now: Date
) {
  const byDomain = new Map<string, DomainDeliverability>();
  for (const row of rows) {
    const domain = row.senderDomain ?? 'unattributed';
    let entry = byDomain.get(domain);
    if (!entry) {
      entry = {
        domain,
        stream:
          domain === 'unattributed'
            ? 'unknown'
            : streamForSenderDomain(domain, source),
        delivered: 0,
        bounced: 0,
        complained: 0,
        bounceRate: null,
        complaintRate: null,
        status: 'insufficient-data',
        breaches: [],
      };
      byDomain.set(domain, entry);
    }
    if (row.status === 'delivered') entry.delivered += row.count;
    else if (row.status === 'bounced') entry.bounced += row.count;
    else if (row.status === 'complained') entry.complained += row.count;
  }

  const domains = [...byDomain.values()].map(entry => {
    const outcomes = entry.delivered + entry.bounced;
    if (outcomes >= MIN_SAMPLE) {
      entry.bounceRate = entry.bounced / outcomes;
      entry.complaintRate = entry.complained / Math.max(entry.delivered, 1);
      const limits =
        entry.stream === 'unknown'
          ? STREAM_THRESHOLDS.transactional
          : STREAM_THRESHOLDS[entry.stream];
      if (entry.bounceRate > limits.bounceRate)
        entry.breaches.push(
          `bounce ${(entry.bounceRate * 100).toFixed(2)}% > ${limits.bounceRate * 100}%`
        );
      if (entry.complaintRate > limits.complaintRate)
        entry.breaches.push(
          `complaint ${(entry.complaintRate * 100).toFixed(3)}% > ${limits.complaintRate * 100}%`
        );
      entry.status = entry.breaches.length > 0 ? 'breach' : 'ok';
    }
    return entry;
  });
  domains.sort((a, b) => a.domain.localeCompare(b.domain));

  return {
    schema: STREAM_DELIVERABILITY_SCHEMA,
    generatedAt: now.toISOString(),
    windowDays,
    minSample: MIN_SAMPLE,
    domains,
    hardViolations: findHardViolations(source),
    separationGaps: separationGaps(source),
    ok:
      findHardViolations(source).length === 0 &&
      domains.every(d => d.status !== 'breach'),
  };
}
