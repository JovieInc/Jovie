export type HudShipperState =
  | 'running'
  | 'paused'
  | 'error'
  | 'idle'
  | 'not_running';

export interface HudInflightJob {
  readonly job: string;
  readonly repo: string;
  readonly issue: number;
  readonly branch: string;
  readonly worktree: string;
  readonly pid: number;
  readonly startedAt: string;
}

export interface HudShipperCapacity {
  readonly allowedAgents: number;
  readonly cpuCount: number;
  readonly freeMemoryMb: number;
  readonly loadAverage1m: number;
  readonly loadPerCpu: number;
  readonly reasons: readonly string[];
}

export interface HudShipperStatusPayload {
  readonly availability: 'available' | 'unavailable';
  readonly state: HudShipperState;
  readonly isPaused: boolean;
  readonly launchdLoaded: boolean;
  readonly lastRunAt: string | null;
  readonly lastResult: string | null;
  readonly dispatchableCount: number;
  readonly inFlightCount: number;
  readonly inFlightJobs: readonly HudInflightJob[];
  readonly currentAgents: readonly string[];
  readonly lastError: string | null;
  readonly recentErrors: readonly string[];
  readonly capacity: HudShipperCapacity | null;
  readonly generatedAtIso: string;
}

export interface HudWhatShippedEntry {
  readonly prNumber: number | null;
  readonly title: string;
  readonly mergedAt: string;
  readonly url: string | null;
  readonly issueNumber: number | null;
}

export interface HudWhatShippedPayload {
  readonly availability: 'available' | 'unavailable';
  readonly entries: readonly HudWhatShippedEntry[];
  readonly generatedAtIso: string;
}

export interface HudGithubRateLimitBucket {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAtIso: string;
}

export interface HudGithubRateLimitsPayload {
  readonly availability: 'available' | 'not_configured' | 'error';
  readonly core: HudGithubRateLimitBucket | null;
  readonly graphql: HudGithubRateLimitBucket | null;
  readonly errorMessage?: string;
  readonly generatedAtIso: string;
}