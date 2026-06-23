import type { AgentRunArtifact } from '@/lib/agent-os/artifact';
import type { HermesAiOpsSummary } from '@/types/ai-ops';

export type HudAccessMode = 'admin' | 'kiosk';

export type HudDeploymentState =
  | 'success'
  | 'failure'
  | 'in_progress'
  | 'unknown'
  | 'not_configured';

export interface HudDeploymentRun {
  id: number;
  runNumber: number;
  status: HudDeploymentState;
  createdAtIso: string;
  branch: string | null;
  url: string | null;
}

export interface HudDeployments {
  availability: 'available' | 'not_configured' | 'error';
  current: HudDeploymentRun | null;
  recent: HudDeploymentRun[];
  errorMessage?: string;
}

export interface HudOverviewMetrics {
  mrrUsd: number;
  activeSubscribers: number;
  balanceUsd: number;
  burnRateUsd: number;
  runwayMonths: number | null;
  defaultStatus: 'alive' | 'dead' | 'unknown';
  defaultStatusDetail: string;
  /** True when Stripe and Mercury data are available; false means financial fields are partial or stubs */
  financialDataAvailable: boolean;
}

export interface HudOperationsStatus {
  status: 'ok' | 'degraded';
  dbLatencyMs: number | null;
  checkedAtIso: string;
}

export interface HudBranding {
  startupName: string;
  logoUrl: string | null;
}

export type HudMetricSourceKey =
  | 'stripe'
  | 'mercury'
  | 'database'
  | 'sentry'
  | 'github';

export type HudMetricSourceState =
  | 'ok'
  | 'unavailable'
  | 'not_configured'
  | 'no_data';

export interface HudMetricSourceTrust {
  readonly key: HudMetricSourceKey;
  readonly label: string;
  readonly state: HudMetricSourceState;
  readonly fetchedAtIso: string;
  readonly errorMessage: string | null;
  readonly dashboardUrl: string | null;
  readonly configureUrl: string | null;
  readonly nextStep: string | null;
}

export interface HudTestingQuarantineMetrics {
  readonly activeCount: number;
  readonly expiredCount: number;
  readonly expiringSoonCount: number;
  readonly unitCount: number;
  readonly e2eCount: number;
  readonly estimatedRetryAttemptsPerRun: number;
  readonly retryBudgetCap: number;
  readonly retryBudgetUsagePercent: number;
  readonly withinRetryBudget: boolean;
  readonly unitDefaultRetries: number;
  readonly quarantineUnitRetries: number;
  readonly quarantineE2eRetries: number;
  readonly isValid: boolean;
  readonly ledgerPath: string;
}

export interface HudMetrics {
  accessMode: HudAccessMode;
  branding: HudBranding;
  overview: HudOverviewMetrics;
  operations: HudOperationsStatus;
  reliability: {
    errorRatePercent: number;
    /** Pre-computed reliability score: 100 - errorRatePercent, clamped [0, 100] */
    reliabilityScorePercent: number;
    p95LatencyMs: number | null;
    incidents24h: number;
    lastIncidentAtIso: string | null;
    unresolvedSentryIssues24h: number;
  };
  testing: {
    quarantine: HudTestingQuarantineMetrics;
  };
  deployments: HudDeployments;
  aiOps: HermesAiOpsSummary;
  /** Live Hermes events mapped for Agent OS runs panel (laptop ingest). */
  agentRuns: AgentRunArtifact[];
  /** Per-source fetch metadata for ops metric cards (freshness + failure states). */
  sources: Record<HudMetricSourceKey, HudMetricSourceTrust>;
  generatedAtIso: string;
}
