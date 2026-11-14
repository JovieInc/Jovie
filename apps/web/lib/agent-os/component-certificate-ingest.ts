import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';

/**
 * Persistence for the component-certificate Ovie evidence route
 * (JOV-12456). CI posts one bounded compact packet per run; the full report
 * stays in the run artifact. Stored through the shared Ovie operating KV so
 * no new table or migration is introduced.
 */

const LATEST_KEY = 'component-certificate:latest';
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

export type ComponentCertificateDeliveryRecord = {
  readonly historyCount: number;
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
  await backend.set(LATEST_KEY, packet);
  // Evidence-grade last-write-wins: a concurrent delivery can drop a history
  // row; the artifact and `latest` remain the authoritative records.
  const current = await backend.get(HISTORY_KEY);
  const history = Array.isArray(current) ? current : [];
  const next = [summaryOf(packet), ...history].slice(0, HISTORY_CAP);
  await backend.set(HISTORY_KEY, next);
  return { historyCount: next.length, key: LATEST_KEY, packet };
}

export async function readLatestComponentCertificateDelivery(): Promise<unknown> {
  const backend = postgresRecordBackend();
  return backend.get(LATEST_KEY);
}
