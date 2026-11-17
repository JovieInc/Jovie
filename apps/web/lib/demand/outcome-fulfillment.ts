import type {
  CapabilityCertification,
  CapabilityDraft,
  CapabilityOutcome,
  CapabilitySupplier,
} from './outcome-contract';

const REQUIRED_TESTS = [
  'tenant-isolation',
  'revocation',
  'replay',
  'failure-recovery',
  'unsupported',
] as const;

/** Equal-time contradictory evidence has no authoritative winner. */
function latest<T>(items: readonly T[], at: (item: T) => string): T | null {
  const sorted = [...items].sort(
    (a, b) => Date.parse(at(b)) - Date.parse(at(a))
  );
  if (!sorted.length) return null;
  return sorted[1] && Date.parse(at(sorted[0])) === Date.parse(at(sorted[1]))
    ? null
    : sorted[0];
}

/** Projection only. Canonical owners produce receipts; allocation grants no authority. */
export function projectSupplierFulfillment(
  supplier: CapabilitySupplier | undefined,
  digest: string | null,
  certifications: readonly CapabilityCertification[],
  outcomes: readonly CapabilityOutcome[],
  now: Date
) {
  const certificate = latest(
    certifications.filter(item => item.supplierDigest === digest),
    item => item.verifiedAt
  );
  // Transport aliases retain ledger identity but project one domain outcome.
  const sourceOutcomes = [
    ...new Map(
      outcomes
        .filter(item => item.supplierDigest === digest)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(item => [JSON.stringify({ ...item, id: undefined }), item])
    ).values(),
  ];
  // Revocation/deletion is a source boundary, not a failed job to retry.
  const invalidatedAt = Math.max(
    -Infinity,
    ...sourceOutcomes
      .filter(item => ['revoked', 'deleted'].includes(item.status))
      .map(item => Date.parse(item.completedAt))
  );
  const certified = Boolean(
    supplier &&
      ['candidate', 'available'].includes(supplier.status) &&
      certificate &&
      certificate.ownerRef === supplier.ownerRef &&
      certificate.authority === supplier.authority &&
      certificate.verdict === 'pass' &&
      Date.parse(certificate.verifiedAt) <= now.getTime() &&
      Date.parse(certificate.verifiedAt) > invalidatedAt &&
      Date.parse(certificate.expiresAt) > now.getTime() &&
      certificate.tests.length === REQUIRED_TESTS.length &&
      REQUIRED_TESTS.every(id =>
        certificate.tests.some(test => test.id === id && test.status === 'pass')
      )
  );
  const jobs = [...new Set(sourceOutcomes.map(item => item.jobId))].map(
    jobId => {
      const receipts = sourceOutcomes.filter(item => item.jobId === jobId);
      const receipt = latest(receipts, item => item.completedAt);
      // Cumulative spend cannot fall after retries, reordered events or ties.
      return {
        receipt,
        cost: Math.max(
          ...receipts.map(item => item.realized.fullyLoadedCostCents)
        ),
      };
    }
  );
  const accepted = jobs.flatMap(({ receipt }) =>
    certified &&
    certificate &&
    receipt &&
    receipt.status === 'correct_completed' &&
    receipt.certificationId === certificate.id &&
    receipt.authority === certificate.authority &&
    receipt.buildSha === certificate.buildSha &&
    Date.parse(receipt.startedAt) >= Date.parse(certificate.verifiedAt) &&
    Date.parse(receipt.completedAt) < Date.parse(certificate.expiresAt)
      ? [receipt]
      : []
  );
  const newest = latest(sourceOutcomes, item => item.completedAt);
  const cost = jobs.reduce((total, job) => total + job.cost, 0);
  const latencies = accepted
    .map(item => item.realized.latencyMs)
    .sort((a, b) => a - b);
  const percentile = (percent: number) =>
    latencies[Math.ceil(percent * latencies.length) - 1] ?? null;
  const summary: NonNullable<CapabilityDraft['fulfillment']> = {
    certified,
    attemptedJobs: jobs.length,
    correctCompletedJobs: accepted.length,
    fullyLoadedCostCents: cost,
    costPerSuccessfulOutcomeCents: accepted.length
      ? cost / accepted.length
      : null,
    successfulOutcomeLatencyMs: {
      n: latencies.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
    },
    latestOutcome: newest?.status ?? (sourceOutcomes.length ? 'unknown' : null),
  };
  return { summary, accepted, newest };
}
