/**
 * Shared tracking layer for `ovie.shipping-state.v1` — the single status model
 * and row shape Jovie (web) and Ovie (shipping screen) both render. UI is out
 * of scope here; presentations adapt over `TrackingTask`.
 *
 * Rules inherited from the IA (`docs/operations/SHIPPING_DISPLAY_IA.md`):
 * - Linear is canonical; identity is `linear:JOV-*`.
 * - Missing measurement is unknown — never zero, never `done`, never `queued`.
 * - A `codex/` branch prefix alone does NOT earn the Codex mark; only a real
 *   Codex Cloud container does.
 * - `container: null` means unknown — never invent `local`.
 */

import type {
  LaneAgent,
  OperationalTaskChecks,
  OperationalTaskPriority,
  OperationalTaskWorkflowState,
} from './operational-task';

export const TRACKING_STATUSES = [
  'queued',
  'running',
  'in-review',
  'blocked',
  'done',
  'failed',
  'cancelled',
] as const;

export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

export const TRACKING_EXECUTOR_KINDS = [
  'codex-cloud',
  'hyperagent',
  'local',
  'github-actions',
  'unknown',
] as const;

export type TrackingExecutorKind = (typeof TRACKING_EXECUTOR_KINDS)[number];

/** Where the work is actually executing. Null on the task = unknown. */
export type TrackingContainer = {
  readonly kind: TrackingExecutorKind;
  readonly id: string | null;
  readonly label: string | null;
  readonly url: string | null;
};

/** Narrow PR projection carried on a tracking row. */
export type TrackingPullRequest = {
  readonly number: number;
  readonly url: string | null;
  readonly checksRollup: OperationalTaskChecks['rollup'];
};

export type TrackingTask = {
  readonly id: `linear:${string}`;
  readonly linearIdentifier: string;
  readonly linearUrl: string | null;
  readonly title: string;
  readonly status: TrackingStatus;
  readonly statusDetail: string | null;
  /** Live lane workflow state, when the operational feed published one. */
  readonly workflowState: OperationalTaskWorkflowState | null;
  readonly container: TrackingContainer | null;
  /** True iff `container.kind === 'codex-cloud'`. A branch prefix never sets it. */
  readonly showCodexMark: boolean;
  readonly agent: LaneAgent | string | null;
  readonly pullRequest: TrackingPullRequest | null;
  readonly updatedAt: string | null;
  readonly priority: OperationalTaskPriority;
};

/** Builds the one container shape that earns the Codex mark. */
export function codexCloudContainer(input: {
  id?: string | null;
  label?: string | null;
  url?: string | null;
}): TrackingContainer {
  return {
    kind: 'codex-cloud',
    id: input.id ?? null,
    label: input.label ?? null,
    url: input.url ?? null,
  };
}

export function isCodexCloudContainer(
  container: TrackingContainer | null | undefined
): boolean {
  return container?.kind === 'codex-cloud';
}

/** Live lane workflow state → tracking status. Total; no unknown members exist. */
export function workflowStateToTrackingStatus(
  workflowState: OperationalTaskWorkflowState
): TrackingStatus {
  switch (workflowState) {
    case 'queued':
      return 'queued';
    case 'running':
    case 'retrying':
      return 'running';
    case 'blocked':
      return 'blocked';
    case 'in-review':
    case 'merge-queued':
      return 'in-review';
    case 'merged':
    case 'production-verified':
      return 'done';
  }
}

/**
 * Presentation-safe detail for states whose tracking status collapses
 * (`retrying` → running, `merge-queued` → in-review, `production-verified` →
 * done). Null when the workflow state needs no qualifier.
 */
export function workflowStateDetail(
  workflowState: OperationalTaskWorkflowState
): string | null {
  switch (workflowState) {
    case 'retrying':
      return 'Retrying';
    case 'merge-queued':
      return 'Merge queued';
    case 'production-verified':
      return 'Production verified';
    default:
      return null;
  }
}

const LINEAR_STATE_MAP: Readonly<Record<string, TrackingStatus>> = {
  backlog: 'queued',
  todo: 'queued',
  triage: 'queued',
  'in progress': 'running',
  'in review': 'in-review',
  blocked: 'blocked',
  done: 'done',
  completed: 'done',
  canceled: 'cancelled',
  cancelled: 'cancelled',
};

/**
 * Linear issue state name → tracking status. Unknown names return null —
 * never a default of `queued`.
 */
export function mapLinearState(name: string): TrackingStatus | null {
  return LINEAR_STATE_MAP[name.trim().toLowerCase()] ?? null;
}

/** PR-shaped input accepted by {@link mapGitHubPullRequest} / {@link toTrackingTask}. */
export type TrackingPullRequestInput = {
  readonly number?: number | null;
  readonly url?: string | null;
  readonly state?: string | null;
  readonly merged?: boolean | null;
  readonly mergedAt?: string | null;
  readonly queueState?: string | null;
  readonly queuePosition?: number | null;
  readonly checksRollup?: OperationalTaskChecks['rollup'] | null;
  /** Accepts the full `OperationalTaskPullRequest` shape via its nested `checks`. */
  readonly checks?: OperationalTaskChecks | null;
  readonly agent?: LaneAgent | string | null;
};

function checksRollupOf(
  pr: TrackingPullRequestInput
): OperationalTaskChecks['rollup'] {
  return pr.checksRollup ?? pr.checks?.rollup ?? 'unknown';
}

/**
 * GitHub PR status → tracking status, highest precedence first:
 * merged → done; closed unmerged → cancelled; merge-queue membership →
 * in-review; pending checks on an open PR → running; open with passing or
 * failing checks → in-review; open with no running checks → queued.
 *
 * A failing check rollup on a still-open PR is NEVER `failed` — failure rides
 * on `checksRollup`, and only a caller with lane-blocked evidence may upgrade
 * the row to `blocked`. No PR evidence at all → null.
 */
export function mapGitHubPullRequest(
  pr: TrackingPullRequestInput
): TrackingStatus | null {
  const merged =
    pr.merged === true || (pr.mergedAt != null && pr.mergedAt !== '');
  if (merged) return 'done';
  if (pr.state !== 'open' && pr.state !== 'closed') return null;
  if (pr.state === 'closed') return 'cancelled';
  const queuedInMergeQueue =
    (pr.queueState != null && pr.queueState !== '') || pr.queuePosition != null;
  if (queuedInMergeQueue) return 'in-review';
  const rollup = checksRollupOf(pr);
  if (rollup === 'pending') return 'running';
  if (rollup === 'success' || rollup === 'failure') return 'in-review';
  return 'queued';
}

/**
 * Codex Cloud run status → tracking status. `succeeded`/`completed` return
 * null: run success does not make the ISSUE done — the issue or PR says so.
 * Unknown strings return null, never `queued` or `done`.
 */
export function mapCodexCloudTask(
  status: string | null | undefined
): TrackingStatus | null {
  if (status == null) return null;
  switch (status.trim().toLowerCase()) {
    case 'pending':
    case 'queued':
      return 'queued';
    case 'in_progress':
    case 'in-progress':
    case 'running':
      return 'running';
    case 'succeeded':
    case 'completed':
      return null;
    case 'failed':
    case 'error':
      return 'failed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return null;
  }
}

/** Input accepted by {@link toTrackingTask}. */
export type TrackingTaskInput = {
  readonly id: `linear:${string}`;
  readonly linearIdentifier: string;
  readonly linearUrl?: string | null;
  readonly title: string;
  /** Live lane workflow state from the operational feed. */
  readonly workflowState?: OperationalTaskWorkflowState | null;
  /** Codex Cloud run status string, when the task executes on Codex Cloud. */
  readonly codexCloudStatus?: string | null;
  /** Linear issue state name, when known. */
  readonly linearStateName?: string | null;
  readonly pullRequest?: TrackingPullRequestInput | null;
  readonly container?: TrackingContainer | null;
  readonly agent?: LaneAgent | string | null;
  readonly statusDetail?: string | null;
  readonly updatedAt?: string | null;
  readonly priority?: OperationalTaskPriority;
};

/**
 * Resolves a tracking status with documented precedence, highest first:
 * 1. explicit terminal Codex/Linear `cancelled` or `failed`;
 * 2. the live workflow state;
 * 3. the GitHub PR / check rollup;
 * 4. the Linear issue state (or non-terminal Codex run status).
 * Unknown must not become `done` or `queued` — when no signal resolves, the
 * composer refuses instead of inventing a status.
 */
export function resolveTrackingStatus(
  input: Pick<
    TrackingTaskInput,
    'workflowState' | 'codexCloudStatus' | 'linearStateName' | 'pullRequest'
  >
): TrackingStatus {
  const codexStatus = mapCodexCloudTask(input.codexCloudStatus);
  const linearStatus =
    input.linearStateName != null
      ? mapLinearState(input.linearStateName)
      : null;
  if (codexStatus === 'failed' || codexStatus === 'cancelled') {
    return codexStatus;
  }
  if (linearStatus === 'cancelled') return linearStatus;
  if (input.workflowState) {
    return workflowStateToTrackingStatus(input.workflowState);
  }
  const prStatus = input.pullRequest
    ? mapGitHubPullRequest(input.pullRequest)
    : null;
  if (prStatus) return prStatus;
  if (linearStatus) return linearStatus;
  if (codexStatus) return codexStatus;
  throw new Error(
    `resolveTrackingStatus: no status signal for task — refusing to invent queued/done`
  );
}

/** Composes the leaf mappers into one `TrackingTask` row. */
export function toTrackingTask(input: TrackingTaskInput): TrackingTask {
  const status = resolveTrackingStatus(input);
  const container = input.container ?? null;
  const pr = input.pullRequest ?? null;
  const prNumber = pr?.number ?? null;
  return {
    id: input.id,
    linearIdentifier: input.linearIdentifier,
    linearUrl: input.linearUrl ?? null,
    title: input.title,
    status,
    statusDetail:
      input.statusDetail != null
        ? input.statusDetail
        : input.workflowState
          ? workflowStateDetail(input.workflowState)
          : null,
    workflowState: input.workflowState ?? null,
    container,
    showCodexMark: isCodexCloudContainer(container),
    agent: input.agent ?? pr?.agent ?? null,
    pullRequest:
      pr && prNumber != null
        ? {
            number: prNumber,
            url: pr.url ?? null,
            checksRollup: checksRollupOf(pr),
          }
        : null,
    updatedAt: input.updatedAt ?? null,
    priority: input.priority ?? 'none',
  };
}

/** Fixed presentation order for tracking-status groups. */
export const TRACKING_STATUS_GROUP_ORDER: readonly TrackingStatus[] = [
  'blocked',
  'failed',
  'running',
  'in-review',
  'queued',
  'done',
  'cancelled',
];

export function trackingStatusRank(status: TrackingStatus): number {
  return TRACKING_STATUS_GROUP_ORDER.indexOf(status);
}

/** Group order first; within a group, most recently updated first; null last. */
export function compareTrackingTasks(a: TrackingTask, b: TrackingTask): number {
  const rank = trackingStatusRank(a.status) - trackingStatusRank(b.status);
  if (rank !== 0) return rank;
  const at = a.updatedAt != null ? Date.parse(a.updatedAt) : null;
  const bt = b.updatedAt != null ? Date.parse(b.updatedAt) : null;
  if (at === null && bt === null) {
    return a.linearIdentifier.localeCompare(b.linearIdentifier);
  }
  if (at === null) return 1;
  if (bt === null) return -1;
  if (at !== bt) return bt - at;
  return a.linearIdentifier.localeCompare(b.linearIdentifier);
}

export function sortTrackingTasks(
  tasks: readonly TrackingTask[]
): TrackingTask[] {
  return [...tasks].sort(compareTrackingTasks);
}

export type TrackingTaskGroups = Readonly<
  Record<TrackingStatus, readonly TrackingTask[]>
>;

/** Groups rows by status in the fixed presentation order; every key is present. */
export function groupTrackingTasksByStatus(
  tasks: readonly TrackingTask[]
): TrackingTaskGroups {
  const groups: Record<TrackingStatus, TrackingTask[]> = {
    blocked: [],
    failed: [],
    running: [],
    'in-review': [],
    queued: [],
    done: [],
    cancelled: [],
  };
  for (const task of tasks) groups[task.status].push(task);
  for (const key of TRACKING_STATUS_GROUP_ORDER) {
    groups[key] = [...groups[key]].sort(compareTrackingTasks);
  }
  return groups;
}
