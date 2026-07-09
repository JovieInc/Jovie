/**
 * Types for the ephemeral CI runner autoscaler.
 */

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

// ── Container types ────────────────────────────────────────────

export interface EphemeralContainer {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly runnerId: number | null;
  readonly runnerName: string;
}

// ── Config ─────────────────────────────────────────────────────

export type AutoscalerAgent = 'claude' | 'codex' | 'grok';
export type RiskLevel = 'low' | 'medium' | 'high';
export type FailureClass =
  | 'known-flake'
  | 'infrastructure'
  | 'test-flake'
  | 'real-failure'
  | 'tooling-issue';

export interface RunnerAutoscalerConfig {
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
  readonly gbraintoken: string;
  readonly gbrainUrl: string;

  // Model routing (matching shipper conventions)
  readonly simpleModel: string;
  readonly standardModel: string;
  readonly escalationModel: string;
  readonly fallbackModel: string;

  // Evals mode — when true, uses mocked GitHub/Docker for testing
  readonly evalsMode: boolean;
  readonly dryRun: boolean;
}

// ── Autoscaler state ───────────────────────────────────────────

export interface AutoscalerState {
  readonly queuedJobs: number;
  readonly activeRunners: number;
  readonly idleRunners: ReadonlyArray<EphemeralContainer>;
  readonly spawnedThisTick: number;
  readonly reapedThisTick: number;
  readonly reconciledThisTick: number;
  readonly timestamp: Date;
}

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

// ── Task routing (matching shipper) ────────────────────────────

export type ModelProfile = 'simple' | 'standard' | 'escalation';

export interface TaskRoute {
  readonly profile: ModelProfile;
  readonly model: string;
  readonly fallbackModel: string;
  readonly reasons: ReadonlyArray<string>;
}

// ── Evals types ────────────────────────────────────────────────

export type EvalStatus = 'pass' | 'fail';

export interface EvalResult {
  readonly name: string;
  readonly status: EvalStatus;
  readonly detail: string;
  readonly durationMs: number;
}
