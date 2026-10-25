export type Freshness = 'fresh' | 'stale' | 'unknown';
export type PaceVerdict =
  | 'under-burning'
  | 'on-pace'
  | 'over-burning'
  | 'reset-passed'
  | 'unconfirmed'
  | 'unknown';
export type CreditVerdict =
  | 'exhausts-before-expiry'
  | 'unspent-at-expiry'
  | 'on-pace'
  | 'unknown';

export interface CapacityRegistry {
  readonly schema: string;
  readonly updatedAt: string;
  readonly thresholds: {
    readonly liveMaxAgeHours: number;
    readonly manualMaxAgeDays: number;
  };
  readonly policies: Record<string, { readonly rule: string }>;
  readonly providers: readonly unknown[];
}

export interface QuotaView {
  readonly usedPercent: number | null;
  readonly remainingPercent: number | null;
  readonly elapsedPercent: number | null;
  readonly paceDeltaPercent: number | null;
  readonly resetsAt: string | null;
  readonly cadence: string | null;
  readonly verdict: PaceVerdict;
  readonly source: string;
  readonly observedAt: string;
  readonly live: boolean;
  readonly freshness: Freshness;
  readonly ageHours: number | null;
  readonly note: string | null;
}

export interface CreditsView {
  readonly balanceUsd: number | null;
  readonly expiresAt: string | null;
  readonly daysLeft: number | null;
  readonly requiredPerDayUsd: number | null;
  readonly burnPerDayUsd: number | null;
  readonly runwayDays: number | null;
  readonly verdict: CreditVerdict;
  readonly source: string;
  readonly observedAt: string;
  readonly live: boolean;
  readonly freshness: Freshness;
  readonly ageHours: number | null;
}

export interface PlanView {
  readonly name: string;
  readonly tier: string | null;
  readonly listUsdMonthly: number | null;
  readonly effectiveUsdMonthly: number | null;
  readonly promoActive: boolean;
  readonly promoUntil: string | null;
  readonly promoDaysLeft: number | null;
  readonly billing: string;
  readonly usdYearly: number | null;
  readonly source: string;
  readonly asOf: string;
}

export interface AccountView {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly emailSha256: string | null;
  readonly status: string;
  readonly seats: number | null;
  readonly plan: PlanView | null;
  readonly quota: QuotaView | null;
  readonly credits: CreditsView | null;
  readonly notes: string | null;
}

export interface ProviderView {
  readonly id: string;
  readonly label: string;
  readonly vendor: string;
  readonly agents: readonly string[];
  readonly lane: string | null;
  readonly usageModel: string;
  readonly policy: {
    readonly id: string;
    readonly rule: string;
    readonly delegation?: string;
  };
  readonly limits: Record<string, unknown>;
  readonly decision: Record<string, string> | null;
  readonly metrics: ProviderMetrics | null;
  readonly accounts: readonly AccountView[];
  readonly joinedSpend: readonly {
    readonly id: string;
    readonly kind: string;
    readonly cap: {
      readonly amountUsd: number;
      readonly period: string;
    } | null;
    readonly snapshot: Record<string, unknown> | null;
  }[];
  readonly monthlyUsd: number;
  readonly freshness: Freshness;
}

export interface ProviderMetrics {
  readonly windowDays: number;
  readonly runs: number;
  readonly prsCreated: number;
  readonly mergedCreated: number;
  readonly mergedRepaired: number;
  readonly costUsd: number | null;
  readonly costBasis: string;
  readonly costPerMergedUsd: number | null;
}

export interface CapacityAlert {
  readonly id: string;
  readonly severity: 'alarm' | 'info';
  readonly provider: string;
  readonly message: string;
}

export interface CapacityView {
  readonly generatedAt: string;
  readonly providers: readonly ProviderView[];
  readonly totals: {
    readonly monthlyUsd: number;
    readonly stale: readonly string[];
  };
  readonly metricsMeta: {
    readonly windowDays: number | null;
    readonly mergedInWindow: number | null;
    readonly readAt: string | null;
    readonly incomplete: string | null;
  } | null;
  readonly alerts: readonly CapacityAlert[];
}

export interface LiveOverlay {
  readonly accounts?: Record<
    string,
    { readonly quota?: object; readonly credits?: object }
  >;
  readonly metrics?: {
    readonly windowDays?: number;
    readonly mergedInWindow?: number;
    readonly readAt?: string;
    readonly incomplete?: string;
    readonly providers?: Record<string, ProviderMetrics>;
  };
}

export const SCHEMA: string;
export const DAY_MS: number;
export function validateRegistry(
  registry: unknown,
  options?: { agentIds?: readonly string[]; spendIds?: readonly string[] }
): string[];
export function evaluateRegistry(
  registry: unknown,
  options?: {
    now?: number;
    live?: LiveOverlay;
    spend?: { providers?: readonly unknown[] };
  }
): CapacityView;
export function capacityAlerts(view: CapacityView): CapacityAlert[];
export function routingOrder(
  view: CapacityView
): readonly { id: string; rank: number; freshness: Freshness }[];
export function renderCanon(view: CapacityView, registry: unknown): string;
