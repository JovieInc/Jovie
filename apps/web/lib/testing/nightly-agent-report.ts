/**
 * Nightly testing agent status contract (JOV-1870).
 *
 * Shared between:
 *  - The GitHub Actions report job (`scripts/nightly-test-agent.ts publish-status`)
 *  - The admin ops panel (`lib/admin/ops-queries.ts`)
 *
 * The workflow writes a compact JSON snapshot to Redis after each run so
 * `/app/admin/ops` can surface last-pass health without querying GitHub.
 */

export const NIGHTLY_AGENT_REDIS_KEY = 'nightly-agent:jovie:last_run';

/** 30 hours — survives a brief cron delay or holiday skip. */
export const NIGHTLY_AGENT_REDIS_TTL_SECONDS = 30 * 60 * 60;

export const NIGHTLY_AGENT_REPORT_DOC_PATH =
  'docs/NIGHTLY_TESTING_AGENT_REPORT.md';

export const NIGHTLY_AGENT_WORKFLOW_FILE =
  '.github/workflows/nightly-testing-agent.yml';

export interface NightlyAgentSuiteSummary {
  lane: string;
  total: number;
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
}

export interface NightlyAgentMutationSummary {
  score: number;
  killed: number;
  survived: number;
  total: number;
  timedOut?: number;
}

export interface NightlyAgentStatus {
  /** ISO timestamp of when the report was generated. */
  generatedAt: string;
  repo: string;
  /** Overall pass when all executed lanes are green. */
  pass: boolean;
  /** Link to the GitHub Actions workflow run that produced this report. */
  workflowRunUrl?: string;
  /** Relative repo path to the committed markdown report. */
  reportDocPath: string;
  suites: NightlyAgentSuiteSummary[];
  failureCount: number;
  selectedTargetCount: number;
  mutation?: NightlyAgentMutationSummary;
  /** GitHub workflow conclusion for the overall run, when known. */
  workflowConclusion?: 'success' | 'failure' | 'cancelled' | 'timed_out';
}

export interface NightlyAgentSkillDelta {
  generatedAt: string;
  repo: string;
  selectedTargets?: Array<{
    id: string;
    module: string;
    score: number;
    lanes: string[];
  }>;
  failures?: Array<{
    testId: string;
    lane: string;
    file?: string;
    fingerprint: string;
  }>;
  mutation?: {
    score: number;
    killed: number;
    survived: number;
    total: number;
    timedOut?: number;
  };
}

function isSuiteSummary(value: unknown): value is NightlyAgentSuiteSummary {
  if (!value || typeof value !== 'object') return false;
  const suite = value as Partial<NightlyAgentSuiteSummary>;
  return (
    typeof suite.lane === 'string' &&
    typeof suite.total === 'number' &&
    typeof suite.passed === 'number' &&
    typeof suite.failed === 'number' &&
    typeof suite.flaky === 'number' &&
    typeof suite.skipped === 'number'
  );
}

function isMutationSummary(
  value: unknown
): value is NightlyAgentMutationSummary {
  if (!value || typeof value !== 'object') return false;
  const mutation = value as Partial<NightlyAgentMutationSummary>;
  return (
    typeof mutation.score === 'number' &&
    typeof mutation.killed === 'number' &&
    typeof mutation.survived === 'number' &&
    typeof mutation.total === 'number' &&
    (mutation.timedOut === undefined || typeof mutation.timedOut === 'number')
  );
}

export function isNightlyAgentStatus(
  value: unknown
): value is NightlyAgentStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<NightlyAgentStatus>;
  return (
    typeof status.generatedAt === 'string' &&
    typeof status.repo === 'string' &&
    typeof status.pass === 'boolean' &&
    typeof status.reportDocPath === 'string' &&
    Array.isArray(status.suites) &&
    status.suites.every(isSuiteSummary) &&
    typeof status.failureCount === 'number' &&
    typeof status.selectedTargetCount === 'number' &&
    (status.workflowRunUrl === undefined ||
      typeof status.workflowRunUrl === 'string') &&
    (status.mutation === undefined || isMutationSummary(status.mutation)) &&
    (status.workflowConclusion === undefined ||
      status.workflowConclusion === 'success' ||
      status.workflowConclusion === 'failure' ||
      status.workflowConclusion === 'cancelled' ||
      status.workflowConclusion === 'timed_out')
  );
}

export function parseNightlyAgentStatus(
  raw: unknown
): NightlyAgentStatus | null {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return isNightlyAgentStatus(parsed) ? parsed : null;
}

export function buildNightlyAgentStatusFromSkillDelta(
  skillDelta: NightlyAgentSkillDelta,
  options: {
    suites: NightlyAgentSuiteSummary[];
    workflowRunUrl?: string;
    workflowConclusion?: NightlyAgentStatus['workflowConclusion'];
  }
): NightlyAgentStatus {
  const failureCount = skillDelta.failures?.length ?? 0;
  const laneFailures = options.suites.reduce(
    (sum, suite) => sum + suite.failed,
    0
  );
  const mutation = skillDelta.mutation
    ? {
        score: skillDelta.mutation.score,
        killed: skillDelta.mutation.killed,
        survived: skillDelta.mutation.survived,
        total: skillDelta.mutation.total,
        timedOut: skillDelta.mutation.timedOut,
      }
    : undefined;

  const pass = laneFailures === 0 && failureCount === 0;

  return {
    generatedAt: skillDelta.generatedAt,
    repo: skillDelta.repo,
    pass,
    workflowRunUrl: options.workflowRunUrl,
    reportDocPath: NIGHTLY_AGENT_REPORT_DOC_PATH,
    suites: options.suites,
    failureCount: Math.max(failureCount, laneFailures),
    selectedTargetCount: skillDelta.selectedTargets?.length ?? 0,
    mutation,
    workflowConclusion: options.workflowConclusion,
  };
}

export function formatNightlyAgentSummary(status: NightlyAgentStatus): string {
  const suiteParts = status.suites.map(
    suite => `${suite.lane} ${suite.passed}/${suite.total}`
  );
  const mutationPart = status.mutation
    ? `mutation ${status.mutation.score.toFixed(1)}%`
    : 'mutation n/a';
  return `${status.pass ? 'pass' : 'fail'} — ${suiteParts.join(', ') || 'no suites'}; ${mutationPart}; ${status.failureCount} failures`;
}
