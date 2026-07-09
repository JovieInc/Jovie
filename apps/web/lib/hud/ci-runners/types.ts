/**
 * Types for the HUD CI runner autoscaler.
 *
 * These types define the contract between:
 * - The autoscaler daemon (gem-linux → Docker + GitHub API)
 * - The Ovie/HUD API route (Next.js → status proxy)
 * - The HUD dashboard widget (React → visual)
 */

// ── Core autoscaler types ─────────────────────────────────────

export interface AutoscalerConfig {
  readonly repo: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly maxRunners: number;
  readonly pollIntervalMs: number;
  readonly idleTimeoutMs: number;
  readonly runnerCpus: number;
  readonly runnerMemoryMb: number;
  readonly runnerImage: string;
  readonly runnerLabels: string;
  readonly runnerWorkDir: string;
  readonly cgroupParent: string;
  readonly dockerSocket: string;
  readonly simpleModel: string;
  readonly standardModel: string;
  readonly escalationModel: string;
  readonly fallbackModel: string;
  readonly evalsMode: boolean;
  readonly dryRun: boolean;
}

export interface AutoscalerState {
  readonly queuedJobs: number;
  readonly activeContainers: number;
  readonly onlineEphemeralRunners: number;
  readonly spawnedThisTick: number;
  readonly reapedThisTick: number;
  readonly reconciledThisTick: number;
  readonly tickCount: number;
  readonly uptimeMs: number;
  readonly timestamp: string;
}

export interface EphemeralContainer {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly runnerId: number | null;
  readonly runnerName: string;
}

// ── GitHub API types ───────────────────────────────────────────

export interface GitHubRunner {
  readonly id: number;
  readonly name: string;
  readonly status: 'online' | 'offline';
  readonly busy: boolean;
  readonly labels: ReadonlyArray<{ readonly name: string }>;
}

export interface GitHubWorkflowRun {
  readonly id: number;
  readonly name: string;
  readonly head_branch: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly html_url: string;
  readonly event: string;
  readonly workflow_id: number;
}

export interface GitHubJob {
  readonly id: number;
  readonly run_id: number;
  readonly run_url: string;
  readonly name: string;
  readonly status: 'queued' | 'in_progress' | 'completed';
  readonly conclusion: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly runner_name: string | null;
  readonly runner_id: number | null;
  readonly labels: ReadonlyArray<string>;
}

export interface GitHubRunnerRegistrationToken {
  readonly token: string;
  readonly expires_at: string;
}

// ── AI / failure analysis types ───────────────────────────────

export type FailureClass =
  | 'known-flake'
  | 'infrastructure'
  | 'test-flake'
  | 'real-failure'
  | 'tooling-issue';

export interface CiFailureReport {
  readonly runId: number;
  readonly jobName: string;
  readonly conclusion: string;
  readonly failureClass: FailureClass;
  readonly confidence: number;
  readonly recommendation: 'retry' | 'escalate' | 'ignore' | 'investigate';
  readonly reasoning: string;
  readonly suggestedAction: string;
}

export interface ScalingRecommendation {
  readonly desiredRunners: number;
  readonly reason: string;
  readonly urgency: 'low' | 'medium' | 'high';
}

// ── Model routing ──────────────────────────────────────────────

export type ModelProfile = 'simple' | 'standard' | 'escalation';

export interface TaskRoute {
  readonly profile: ModelProfile;
  readonly model: string;
  readonly fallbackModel: string;
  readonly reasons: ReadonlyArray<string>;
}

// ── Status types for Ovie/HUD API ─────────────────────────────

export type HudCiRunnerState =
  | 'running'
  | 'paused'
  | 'error'
  | 'stopped'
  | 'unknown';

export interface HudCiRunnerStatusPayload {
  readonly availability: 'available' | 'unavailable';
  readonly state: HudCiRunnerState;
  readonly config: AutoscalerConfig | null;
  readonly stateSnapshot: AutoscalerState | null;
  readonly lastError: string | null;
  readonly modelRoutes: ReadonlyArray<{
    readonly profile: ModelProfile;
    readonly model: string;
    readonly fallback: string;
  }>;
  readonly gemLinuxStatus: 'online' | 'offline' | 'unknown';
  readonly runners: ReadonlyArray<{
    readonly name: string;
    readonly status: string;
    readonly busy: boolean;
    readonly ephemeral: boolean;
  }>;
}

// ── Eval types ────────────────────────────────────────────────

export type EvalStatus = 'pass' | 'fail';

export interface EvalResult {
  readonly name: string;
  readonly status: EvalStatus;
  readonly detail: string;
  readonly durationMs: number;
}
