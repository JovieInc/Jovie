import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { logger } from '@/lib/utils/logger';
import {
  type OrderedEvidenceResult,
  storeOrderedEvidence,
} from './source-ordered-evidence';

/**
 * Persistence for the component-certificate Ovie evidence route
 * (JOV-12456). CI posts one bounded compact packet per run; the full report
 * stays in the run artifact. Stored through the shared Ovie operating KV so
 * no new table or migration is introduced.
 */

// Old deployed receivers still unconditionally write the legacy key. A separate
// namespace keeps those in-flight writes outside the new atomic authority.
const LATEST_KEY = 'component-certificate:source-ordered-latest/v1';
const LEGACY_LATEST_KEY = 'component-certificate:latest';
const HISTORY_KEY = 'component-certificate:history';
// Small history rows (~200 bytes each) stay far under the 256KB KV row
// budget; the full compact packet is only kept under `latest`.
const HISTORY_CAP = 50;

export type ComponentCertificateDeliverySummary = {
  readonly certified: number | null;
  readonly components: number | null;
  readonly evaluatedAt: string | null;
  readonly headSha: string;
  readonly runUrl: string | null;
};

export type ComponentCertificateDeliveryRecord = OrderedEvidenceResult & {
  readonly historyCount: number | null;
  readonly key: string;
  readonly packet: Record<string, unknown>;
};

function summaryOf(packet: {
  evaluatedAt?: unknown;
  headSha: unknown;
  runUrl?: unknown;
  totals?: { certified?: unknown; components?: unknown };
}): ComponentCertificateDeliverySummary {
  const numberOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const stringOrNull = (v: unknown): string | null =>
    typeof v === 'string' && v.length > 0 ? v : null;
  return {
    certified: numberOrNull(packet.totals?.certified),
    components: numberOrNull(packet.totals?.components),
    evaluatedAt: stringOrNull(packet.evaluatedAt),
    headSha: String(packet.headSha),
    runUrl: stringOrNull(packet.runUrl),
  };
}

export async function recordComponentCertificateDelivery(
  packet: Record<string, unknown> & {
    headSha: string;
    totals?: { certified?: number | null; components?: number | null };
  }
): Promise<ComponentCertificateDeliveryRecord> {
  const backend = postgresRecordBackend();
  const result = await storeOrderedEvidence({
    backend,
    key: LATEST_KEY,
    packet,
  });
  let historyCount: number | null = null;
  // History is non-authoritative and best effort, independently of the atomic
  // latest write. A lost history row cannot change the accepted generation.
  if (result.reason === 'stored') {
    try {
      const current = await backend.get(HISTORY_KEY);
      const history = Array.isArray(current) ? current : [];
      const next = [summaryOf(packet), ...history].slice(0, HISTORY_CAP);
      await backend.set(HISTORY_KEY, next);
      historyCount = next.length;
    } catch (error) {
      logger.warn(
        '[component-certificate-evidence] optional history unavailable',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }
  return { ...result, historyCount, key: LATEST_KEY };
}

export async function readLatestComponentCertificateDelivery(): Promise<unknown> {
  const backend = postgresRecordBackend();
  const current = await backend.get(LATEST_KEY);
  return current === null || current === undefined
    ? backend.get(LEGACY_LATEST_KEY)
    : current;
}
