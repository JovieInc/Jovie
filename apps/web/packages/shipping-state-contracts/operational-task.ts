/**
 * Shared operational-task model — moved verbatim from
 * `apps/web/lib/ovie/shipping-state/contract.ts` so Jovie, Ovie, and the Mac
 * app mirror ONE task model (Linear canonical, identity `linear:JOV-*`).
 *
 * Extends `ovie.shipping-state.v1` (JOV-5248); it does not replace it. Zero is
 * only legal after a successful authoritative measurement whose value is
 * actually zero. Missing data never becomes now, zero, healthy, or blank.
 */

/**
 * Branch prefixes of agent lanes. Every prefix gets one GitHub search (cost 1
 * point each). The list was `devin|codex` only, so on 2026-10-25 ~50 of ~140
 * open PRs (glm, opus, grok, cursor) were invisible and Home read "No work in
 * flight" beside 91 red PRs. Add a prefix here when a new lane ships.
 */
export const LANE_BRANCH_PREFIXES = [
  'codex',
  'devin',
  'glm',
  'grok',
  'opus',
  'cursor',
  'sonnet',
  'fable',
] as const;
/** The agent lane a PR belongs to; one value per {@link LANE_BRANCH_PREFIXES}. */
export type LaneAgent = (typeof LANE_BRANCH_PREFIXES)[number];
const LANE_AGENTS: ReadonlySet<string> = new Set(LANE_BRANCH_PREFIXES);
export function isLaneAgent(value: unknown): value is LaneAgent {
  return typeof value === 'string' && LANE_AGENTS.has(value);
}
const LANE_PREFIX_ALTERNATION = LANE_BRANCH_PREFIXES.join('|');
export const LANE_BRANCH_RE = new RegExp(`^(?:${LANE_PREFIX_ALTERNATION})/`);
export const LANE_AGENT_RE = new RegExp(`^(${LANE_PREFIX_ALTERNATION})/`, 'i');
export const LANE_ISSUE_RE = new RegExp(
  `^(?:${LANE_PREFIX_ALTERNATION})/(jov-\\d+)(?:-|$)`,
  'i'
);

export const OPERATIONAL_TASK_WORKFLOW_STATES = [
  'queued',
  'running',
  'retrying',
  'blocked',
  'in-review',
  'merge-queued',
  'merged',
  'production-verified',
] as const;

export type OperationalTaskWorkflowState =
  (typeof OPERATIONAL_TASK_WORKFLOW_STATES)[number];

export const OPERATIONAL_TASK_SYNC_STATES = [
  'fresh',
  'stale',
  'syncing',
  'failed',
] as const;

export type OperationalTaskSyncState =
  (typeof OPERATIONAL_TASK_SYNC_STATES)[number];

export type OperationalTaskPriority =
  | 'urgent'
  | 'high'
  | 'medium'
  | 'low'
  | 'none';

/** Rollup of the head-commit check suite for a lane pull request. */
export type OperationalTaskChecks = {
  readonly rollup: 'success' | 'failure' | 'pending' | 'unknown';
  /** Sanitized names of failing check runs / status contexts (bounded). */
  readonly failing: readonly string[];
};

/**
 * GitHub pull-request detail for a lane task. Null when the task came from a
 * source without PR evidence, or when an older publisher produced the feed.
 */
export type OperationalTaskPullRequest = {
  readonly number: number;
  readonly url: string | null;
  readonly branch: string | null;
  /** Owning agent lane derived from the branch prefix. */
  readonly agent: LaneAgent | null;
  readonly isDraft: boolean;
  readonly checks: OperationalTaskChecks;
  readonly queuePosition: number | null;
  readonly queueState: string | null;
  readonly createdAt: string | null;
};

export type OperationalTask = {
  /** Stable cross-presentation identity. Linear remains the canonical owner. */
  readonly id: `linear:${string}`;
  readonly linearIdentifier: string;
  readonly linearUrl: string | null;
  readonly title: string;
  readonly workflowState: OperationalTaskWorkflowState;
  readonly priority: OperationalTaskPriority;
  readonly attempt: number | null;
  readonly retryAt: string | null;
  readonly sourceRevision: string | null;
  readonly updatedAt: string | null;
  readonly pullRequest?: OperationalTaskPullRequest | null;
};
