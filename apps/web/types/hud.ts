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
  defaultStatus: 'alive' | 'dead';
  defaultStatusDetail: string;
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

export interface HudMetrics {
  accessMode: HudAccessMode;
  branding: HudBranding;
  overview: HudOverviewMetrics;
  operations: HudOperationsStatus;
  reliability: {
    errorRatePercent: number;
    p95LatencyMs: number | null;
    incidents24h: number;
    lastIncidentAtIso: string | null;
  };
  deployments: HudDeployments;
  generatedAtIso: string;
}
