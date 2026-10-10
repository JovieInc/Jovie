/** Match the existing daily canaries' Redis TTL; a missing run is not healthy. */
export const CANARY_RECEIPT_MAX_AGE_MS = 26 * 60 * 60_000;
const CLOCK_SKEW_MS = 60_000;

type CanaryReceipt = { readonly runAt: string } | null;
type CanaryId = 'auth-signup-onboarding' | 'public-profile';
type StaleReceipt = {
  readonly id: CanaryId;
  readonly reason: 'missing' | 'invalid' | 'future' | 'stale';
};

export class CanaryReceiptFreshnessError extends Error {
  constructor(readonly failures: readonly StaleReceipt[]) {
    super(
      `Scheduled canary receipt unavailable: ${failures
        .map(({ id, reason }) => `${id} (${reason})`)
        .join(', ')}`
    );
    this.name = 'CanaryReceiptFreshnessError';
  }
}

/** Liveness only: a fresh failed probe remains fresh and retains its own alert. */
export function assertCanaryReceiptsFresh(
  reports: Readonly<Record<CanaryId, CanaryReceipt>>,
  now: Date
): { checkedAt: string; receipts: Array<{ id: CanaryId; runAt: string }> } {
  const failures: StaleReceipt[] = [];
  const receipts: Array<{ id: CanaryId; runAt: string }> = [];
  for (const id of ['auth-signup-onboarding', 'public-profile'] as const) {
    const report = reports[id];
    if (!report) {
      failures.push({ id, reason: 'missing' });
      continue;
    }
    const ageMs = now.getTime() - Date.parse(report.runAt);
    if (!Number.isFinite(ageMs)) failures.push({ id, reason: 'invalid' });
    else if (ageMs < -CLOCK_SKEW_MS) failures.push({ id, reason: 'future' });
    else if (ageMs >= CANARY_RECEIPT_MAX_AGE_MS)
      failures.push({ id, reason: 'stale' });
    else receipts.push({ id, runAt: report.runAt });
  }
  if (failures.length > 0) throw new CanaryReceiptFreshnessError(failures);
  return { checkedAt: now.toISOString(), receipts };
}
