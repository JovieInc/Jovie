/**
 * Ovie company activity feed (JOV-5322).
 *
 * One row per verified company-work event under the Ovie Mac HUD heroes.
 * Linear owns work identity, the Symphony runtime owns who is hot, GitHub
 * owns what landed, dogfood receipts own deployed proof, and the curated
 * public changelog owns "publicly available". A merged PR never renders as
 * deployed or public without the exact receipt — each row keeps its own
 * state and provenance link, and missing data renders as unknown, never
 * as current or zero.
 */
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';

type OvieOperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];
type OvieOperationalTask = OvieOperationalTaskFeed['tasks'][number];
type OvieOperationalTaskWorkflowState = OvieOperationalTask['workflowState'];

export const OVIE_ACTIVITY_STATES = [
  'queued',
  'in_progress',
  'merged',
  'deployed',
  'public',
  'blocked',
  'failed',
] as const;

export type OvieActivityState = (typeof OVIE_ACTIVITY_STATES)[number];

export const OVIE_ACTIVITY_FRESHNESS = ['fresh', 'stale', 'unknown'] as const;

export type OvieActivityFreshness = (typeof OVIE_ACTIVITY_FRESHNESS)[number];

export const OVIE_ACTIVITY_ROW_LIMIT = 15;
export const OVIE_ACTIVITY_DIGEST_LIMIT = 3;

export type OvieActivityLandedPullRequest = {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly mergedAtIso: string;
};

export type OvieActivityReceiptedShip = {
  readonly linearIssue: string;
  readonly symphonyRef: string;
  readonly mergeQueueRef: string;
  readonly prodSha: string;
  readonly receiptAt: string;
};

export type OvieActivityDigestEntry = {
  readonly version: string;
  readonly date: string;
  readonly title: string;
  readonly url: string;
};

/**
 * Server-composed source inputs for the feed. Serialized onto the Mac HUD
 * snapshot; live task rows join client-side from the shipping-state query.
 */
export type OvieActivitySources = {
  readonly landedPullRequests: readonly OvieActivityLandedPullRequest[];
  readonly receiptedShips: readonly OvieActivityReceiptedShip[];
  readonly publicDigest: readonly OvieActivityDigestEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * Normalize one landed-PR record from the what-shipped ledger
 * (`{number, title, url, merged_at}`; camelCase tolerated).
 */
export function parseLandedPullRequest(
  value: unknown
): OvieActivityLandedPullRequest | null {
  if (!isRecord(value)) return null;
  const mergedAtIso = isoOrNull(value.merged_at) ?? isoOrNull(value.mergedAt);
  if (
    !Number.isInteger(value.number) ||
    Number(value.number) <= 0 ||
    typeof value.title !== 'string' ||
    value.title.trim().length === 0 ||
    typeof value.url !== 'string' ||
    value.url.trim().length === 0 ||
    !mergedAtIso
  ) {
    return null;
  }
  return {
    number: Number(value.number),
    title: value.title.trim(),
    url: value.url.trim(),
    mergedAtIso,
  };
}

export const EMPTY_OVIE_ACTIVITY_SOURCES: OvieActivitySources = {
  landedPullRequests: [],
  receiptedShips: [],
  publicDigest: [],
};

export type OvieActivityRow = {
  readonly id: string;
  readonly state: OvieActivityState;
  readonly stateLabel: string;
  readonly title: string;
  readonly actor: string;
  readonly linearId: string | null;
  readonly linearUrl: string | null;
  readonly href: string | null;
  readonly receipt: string | null;
  readonly freshness: OvieActivityFreshness;
  readonly updatedAtIso: string | null;
  readonly detail: string | null;
};

const TASK_STATE_MAP: Record<
  OvieOperationalTaskWorkflowState,
  OvieActivityState
> = {
  queued: 'queued',
  running: 'in_progress',
  retrying: 'in_progress',
  blocked: 'blocked',
  'in-review': 'in_progress',
  'merge-queued': 'queued',
  merged: 'merged',
  'production-verified': 'deployed',
};

const STATE_LABELS: Record<OvieActivityState, string> = {
  queued: 'Queued',
  in_progress: 'In Progress',
  merged: 'Merged',
  deployed: 'Deployed',
  public: 'Public',
  blocked: 'Blocked',
  failed: 'Failed',
};

const STATE_PRIORITY: Record<OvieActivityState, number> = {
  failed: 0,
  blocked: 1,
  in_progress: 2,
  queued: 3,
  deployed: 4,
  merged: 5,
  public: 6,
};

function taskFeedFreshness(
  syncState: OvieOperationalTaskFeed['syncState']
): OvieActivityFreshness {
  switch (syncState) {
    case 'fresh':
      return 'fresh';
    case 'stale':
    case 'syncing':
      return 'stale';
    default:
      return 'unknown';
  }
}

function taskToRow(
  task: OvieOperationalTask,
  freshness: OvieActivityFreshness
): OvieActivityRow {
  const state = TASK_STATE_MAP[task.workflowState];
  const attempt =
    task.attempt != null && task.attempt > 1
      ? ` · attempt ${task.attempt}`
      : '';
  return {
    id: `task:${task.id}`,
    state,
    stateLabel: STATE_LABELS[state],
    title: task.title,
    actor: 'Symphony runtime',
    linearId: task.linearIdentifier,
    linearUrl: task.linearUrl,
    href: null,
    receipt: null,
    freshness,
    updatedAtIso: task.updatedAt,
    detail: `${task.workflowState}${attempt}`,
  };
}

function landedPrToRow(pr: OvieActivityLandedPullRequest): OvieActivityRow {
  return {
    id: `pr:${pr.number}`,
    state: 'merged',
    stateLabel: STATE_LABELS.merged,
    title: pr.title,
    actor: 'GitHub',
    linearId: null,
    linearUrl: null,
    href: pr.url,
    receipt: null,
    freshness: 'fresh',
    updatedAtIso: pr.mergedAtIso,
    detail: `PR #${pr.number} landed. Awaiting deployment receipt.`,
  };
}

function receiptToRow(ship: OvieActivityReceiptedShip): OvieActivityRow {
  const shortSha = ship.prodSha.slice(0, 7);
  return {
    id: `receipt:${ship.linearIssue}:${ship.prodSha}`,
    state: 'deployed',
    stateLabel: STATE_LABELS.deployed,
    title: `${ship.linearIssue} verified on production`,
    actor: 'Summer',
    linearId: ship.linearIssue,
    linearUrl: null,
    href: null,
    receipt: `prod ${shortSha} · ${ship.receiptAt}`,
    freshness: 'fresh',
    updatedAtIso: ship.receiptAt,
    detail: `Dogfood receipt · merge queue ${ship.mergeQueueRef} · prod ${shortSha}`,
  };
}

function digestToRow(entry: OvieActivityDigestEntry): OvieActivityRow {
  return {
    id: `digest:${entry.version}`,
    state: 'public',
    stateLabel: STATE_LABELS.public,
    title: entry.title,
    actor: 'Ovie',
    linearId: null,
    linearUrl: null,
    href: entry.url,
    receipt: null,
    freshness: 'fresh',
    updatedAtIso: entry.date || null,
    detail: `Curated public digest · ${entry.version}`,
  };
}

function compareRows(a: OvieActivityRow, b: OvieActivityRow): number {
  const priorityDelta = STATE_PRIORITY[a.state] - STATE_PRIORITY[b.state];
  if (priorityDelta !== 0) return priorityDelta;
  const aTime = a.updatedAtIso ? Date.parse(a.updatedAtIso) : Number.NaN;
  const bTime = b.updatedAtIso ? Date.parse(b.updatedAtIso) : Number.NaN;
  if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
  if (Number.isFinite(aTime)) return -1;
  if (Number.isFinite(bTime)) return 1;
  return 0;
}

/**
 * Merge the live Linear/runtime task feed with the serialized source
 * projections. Dedupes on row id so a stale cached task cannot double-render
 * next to its fresher self, and bounds the feed to the glance limit.
 */
export function composeOvieActivityRows(input: {
  readonly taskFeed?: OvieOperationalTaskFeed | null;
  readonly sources: OvieActivitySources;
  readonly limit?: number;
}): OvieActivityRow[] {
  const freshness = input.taskFeed
    ? taskFeedFreshness(input.taskFeed.syncState)
    : 'unknown';
  const seen = new Set<string>();
  const rows: OvieActivityRow[] = [];

  const push = (row: OvieActivityRow): void => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    rows.push(row);
  };

  for (const task of input.taskFeed?.tasks ?? []) {
    push(taskToRow(task, freshness));
  }
  for (const ship of input.sources.receiptedShips) {
    push(receiptToRow(ship));
  }
  for (const pr of input.sources.landedPullRequests) {
    push(landedPrToRow(pr));
  }
  for (const entry of input.sources.publicDigest.slice(
    0,
    OVIE_ACTIVITY_DIGEST_LIMIT
  )) {
    push(digestToRow(entry));
  }

  return rows
    .sort(compareRows)
    .slice(0, input.limit ?? OVIE_ACTIVITY_ROW_LIMIT);
}

export type OvieActivityFeedObservation = 'ok' | 'empty' | 'unavailable';

export function observeOvieActivityFeed(input: {
  readonly rows: readonly OvieActivityRow[];
  readonly taskFeed?: OvieOperationalTaskFeed | null;
  readonly taskRequestFailed?: boolean;
  readonly sourcesAvailable: boolean;
}): OvieActivityFeedObservation {
  if (input.rows.length === 0) {
    return input.taskRequestFailed && !input.sourcesAvailable
      ? 'unavailable'
      : 'empty';
  }
  return 'ok';
}
