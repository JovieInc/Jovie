/**
 * Investor-facing company metrics.
 *
 * A stat reaches the portal only when a database, Stripe, or analytics
 * adapter recorded it. Hand-typed amounts, missing dates, and unknown
 * sources are dropped. An empty snapshot is the truthful state until an
 * adapter is wired.
 */

export type InvestorMetricSourceKind = 'database' | 'stripe' | 'analytics';

export interface SourcedInvestorStat {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly sourceKind: InvestorMetricSourceKind;
  readonly sourceLabel: string;
  readonly observedAt: string;
}

export interface InvestorMetricsSnapshot {
  readonly asOf: string | null;
  readonly stats: readonly SourcedInvestorStat[];
}

const SOURCE_KINDS = new Set<InvestorMetricSourceKind>([
  'database',
  'stripe',
  'analytics',
]);

const OBSERVED_AT = /^\d{4}-\d{2}-\d{2}$/u;

export function selectInvestorFacingStats(
  candidates: readonly SourcedInvestorStat[]
): InvestorMetricsSnapshot {
  const stats = candidates.filter(
    stat =>
      SOURCE_KINDS.has(stat.sourceKind) &&
      stat.id.trim().length > 0 &&
      stat.label.trim().length > 0 &&
      stat.value.trim().length > 0 &&
      stat.unit.trim().length > 0 &&
      stat.sourceLabel.trim().length > 0 &&
      OBSERVED_AT.test(stat.observedAt)
  );

  const asOf = stats.reduce<string | null>((latest, stat) => {
    if (latest === null || stat.observedAt > latest) return stat.observedAt;
    return latest;
  }, null);

  return { asOf, stats };
}

/**
 * Live loader. No adapter is connected, so this returns no stats rather
 * than a remembered or estimated figure.
 */
export function loadInvestorSourcedMetrics(): InvestorMetricsSnapshot {
  return selectInvestorFacingStats([]);
}

/** Integer USD amount from a sourced stat, or null when it is absent. */
export function sourcedUsdAmount(
  snapshot: InvestorMetricsSnapshot,
  id: string
): number | null {
  const stat = snapshot.stats.find(
    candidate => candidate.id === id && candidate.unit === 'usd'
  );
  if (!stat || !/^\d+$/u.test(stat.value)) return null;
  return Number(stat.value);
}
