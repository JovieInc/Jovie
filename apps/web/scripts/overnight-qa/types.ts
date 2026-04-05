export type OvernightRunStatus = 'running' | 'paused' | 'blocked' | 'complete';

export type OvernightSuiteKind = 'route-qa' | 'playwright';

export type OvernightIssueSource = 'route-qa' | 'playwright';

export type OvernightIssueSurface =
  | 'creator'
  | 'settings'
  | 'admin'
  | 'alias'
  | 'marketing'
  | 'public-profile'
  | 'billing'
  | 'onboarding'
  | 'legal'
  | 'auth'
  | 'api'
  | 'unknown';

export type OvernightIssueStatus =
  | 'queued'
  | 'fixing'
  | 'verified'
  | 'parked'
  | 'unfixable'
  | 'merged';

export type VerificationStepKind = 'route-qa' | 'playwright' | 'command';

export interface VerificationStep {
  readonly id: string;
  readonly label: string;
  readonly kind: VerificationStepKind;
  readonly command: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface OvernightIssue {
  readonly key: string;
  readonly suiteId: string;
  readonly source: OvernightIssueSource;
  readonly surface: OvernightIssueSurface;
  readonly path: string | null;
  readonly summary: string;
  readonly signature: string;
  readonly evidencePaths: readonly string[];
  readonly discoveredAt: string;
  readonly priority: number;
  readonly verificationSteps: readonly VerificationStep[];
  readonly failureContext?: string;
  readonly routeFilter?: string | null;
  readonly testFile?: string | null;
}

export interface SuiteRunResult {
  readonly id: string;
  readonly label: string;
  readonly kind: OvernightSuiteKind;
  readonly command: readonly string[];
  readonly status: 'pass' | 'fail';
  readonly issuesFound: number;
  readonly artifactPaths: readonly string[];
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly reportPath?: string;
}

export interface SweepResult {
  readonly suites: readonly SuiteRunResult[];
  readonly issues: readonly OvernightIssue[];
}

export interface OvernightSuiteDefinition {
  readonly id: string;
  readonly label: string;
  readonly kind: OvernightSuiteKind;
  readonly priority: number;
  readonly command: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly reportFileName?: string;
  readonly failureSurface?: OvernightIssueSurface;
}

export interface IssueHistoryEntry {
  readonly status: OvernightIssueStatus;
  readonly branch?: string;
  readonly prUrl?: string;
  readonly mergeSha?: string;
  readonly updatedAt: string;
  readonly reason?: string;
}

export interface OvernightRunState {
  readonly runId: string;
  readonly status: OvernightRunStatus;
  readonly currentIssue: string | null;
  readonly currentBranch: string | null;
  readonly mergedFixCount: number;
  readonly lastPrUrl: string | null;
  readonly lastDeploySha: string | null;
  readonly stopReason: string | null;
  readonly activeRunDir: string | null;
  readonly queuedIssueKeys: readonly string[];
  readonly issueHistory: Readonly<Record<string, IssueHistoryEntry>>;
  readonly consecutiveCiFailures: number;
  readonly consecutiveUnfixableIssues: number;
}

export interface OvernightPaths {
  readonly controllerRoot: string;
  readonly runsRoot: string;
  readonly statePath: string;
  readonly queuePath: string;
  readonly stopPath: string;
}

export interface RiskAssessment {
  readonly blocked: boolean;
  readonly requiresHuman: boolean;
  readonly autoMergeEligible: boolean;
  readonly needsTesting: boolean;
  readonly labels: readonly string[];
  readonly reasons: readonly string[];
  readonly touchedPaths: readonly string[];
  readonly totalFiles: number;
  readonly totalDiffLines: number;
}

export interface PullRequestInfo {
  readonly number: number;
  readonly url: string;
  readonly title: string;
  readonly branch: string;
}

export interface DeployWaitResult {
  readonly status: 'passed' | 'failed' | 'timed_out';
  readonly mergeSha: string;
  readonly workflowName: string | null;
  readonly failedJobs: readonly string[];
}

export interface ControllerOptions {
  readonly dryRun: boolean;
  readonly resume: boolean;
  readonly statusOnly: boolean;
}

export interface ManagedServer {
  readonly port: number;
  readonly baseUrl: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly stop: () => Promise<void>;
}

export interface CommandExecutionResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}
