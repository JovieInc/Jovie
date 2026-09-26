// Ovie company activity feed (JOV-5322). One ledger-projection feed under the
// Mac HUD heroes: Linear is the sole work ledger, Symphony runtime shows what
// is hot, GitHub/native MQ shows what landed, dogfood receipts mark deployed,
// and the curated public changelog is the What's New digest.
// A merged PR is never 'deployed' without an exact receipt, and missing data
// is never presented as fresh, zero, or current.

import { APP_ROUTES } from '@/constants/routes';
import type { CustomerChangelogEntry } from '@/lib/customer-changelog';
import type { OvieMacHudInFlightPullRequests } from '@/lib/hud/ovie-mac-hud';
import { parseReceiptedShip } from '@/lib/hud/ovie-mac-hud';
import type {
  OperationalTask,
  OperationalTaskSyncState,
  OperationalTaskWorkflowState,
} from '@/lib/ovie/shipping-state';

export const OVIE_ACTIVITY_FEED_LIMIT = 20;
export const OVIE_ACTIVITY_FEED_DIGEST_LIMIT = 8;

export type OvieActivityFeedState =
  | 'queued'
  | 'in-progress'
  | 'merged'
  | 'deployed'
  | 'publicly-available'
  | 'blocked'
  | 'failed'
  | 'unknown';

export type OvieActivityFeedSource =
  | 'linear'
  | 'runtime'
  | 'github'
  | 'deploy-receipt'
  | 'public-digest';

export type OvieActivityFeedFreshness = 'fresh' | 'stale' | 'unknown';

export type OvieActivityFeedRow = {
  readonly id: string;
  readonly source: OvieActivityFeedSource;
  readonly state: OvieActivityFeedState;
  readonly stateLabel: string;
  readonly title: string;
  readonly actor: string | null;
  readonly linearIdentifier: string | null;
  readonly linearUrl: string | null;
  readonly prUrl: string | null;
  readonly digestUrl: string | null;
  readonly detail: string;
  readonly updatedAtIso: string | null;
  readonly freshness: OvieActivityFeedFreshness;
};

export type OvieActivityFeedAvailability =
  | 'available'
  | 'partial'
  | 'not_configured'
  | 'error';

export type OvieActivityFeed = {
  readonly availability: OvieActivityFeedAvailability;
  readonly rows: readonly OvieActivityFeedRow[];
  readonly truncated: boolean;
};

export const OVIE_ACTIVITY_STATE_LABELS: Record<OvieActivityFeedState, string> =
  {
    queued: 'Queued',
    'in-progress': 'In Progress',
    merged: 'Merged',
    deployed: 'Deployed',
    'publicly-available': "What's New",
    blocked: 'Blocked',
    failed: 'Failed',
    unknown: 'Unknown',
  };

const WORKFLOW_STATE_TO_FEED_STATE: Record<
  OperationalTaskWorkflowState,
  OvieActivityFeedState
> = {
  queued: 'queued',
  running: 'in-progress',
  retrying: 'in-progress',
  'in-review': 'in-progress',
  'merge-queued': 'queued',
  merged: 'merged',
  'production-verified': 'deployed',
  blocked: 'blocked',
};

const WORKFLOW_STATE_DETAIL: Record<OperationalTaskWorkflowState, string> = {
  queued: 'Queued in Linear',
  running: 'Symphony runtime active',
  retrying: 'Symphony retrying',
  'in-review': 'In review',
  'merge-queued': 'In native merge queue',
  merged: 'Merged — awaiting deploy receipt',
  'production-verified': 'Production verified',
  blocked: 'Blocked',
};

function syncStateToFreshness(
  syncState: OperationalTaskSyncState
): OvieActivityFeedFreshness {
  if (syncState === 'fresh') return 'fresh';
  if (syncState === 'stale') return 'stale';
  return 'unknown';
}

export type OvieActivityTask = Omit<OperationalTask, 'id'> & {
  readonly id: string;
};

export function operationalTaskToFeedRow(
  task: OvieActivityTask,
  syncState: OperationalTaskSyncState
): OvieActivityFeedRow {
  const state = WORKFLOW_STATE_TO_FEED_STATE[task.workflowState];
  const attemptDetail =
    task.workflowState === 'retrying' && task.attempt != null
      ? `Symphony retrying (attempt ${task.attempt})`
      : WORKFLOW_STATE_DETAIL[task.workflowState];
  return {
    id: `task:${task.id}`,
    source: 'linear',
    state,
    stateLabel: OVIE_ACTIVITY_STATE_LABELS[state],
    title: task.title,
    actor: 'Symphony',
    linearIdentifier: task.linearIdentifier,
    linearUrl: task.linearUrl,
    prUrl: null,
    digestUrl: null,
    detail: attemptDetail,
    updatedAtIso: task.updatedAt,
    freshness: syncStateToFreshness(syncState),
  };
}

function inFlightPrToFeedRow(
  pr: OvieMacHudInFlightPullRequests['items'][number]
): OvieActivityFeedRow {
  const state: OvieActivityFeedState =
    pr.status === 'merge_queue'
      ? 'queued'
      : pr.status === 'blocked'
        ? 'blocked'
        : 'in-progress';
  return {
    id: `pr:${pr.number}`,
    source: 'github',
    state,
    stateLabel:
      pr.status === 'merge_queue'
        ? 'Merge Queued'
        : OVIE_ACTIVITY_STATE_LABELS[state],
    title: pr.title,
    actor: pr.authorLogin,
    linearIdentifier: null,
    linearUrl: null,
    prUrl: pr.url,
    digestUrl: null,
    detail: `PR #${pr.number} · ${pr.statusDetail}`,
    updatedAtIso: pr.updatedAtIso,
    freshness: 'fresh',
  };
}

function receiptedShipToFeedRow(
  ship: NonNullable<ReturnType<typeof parseReceiptedShip>>
): OvieActivityFeedRow {
  return {
    id: `receipt:${ship.linearIssue}:${ship.prodSha}`,
    source: 'deploy-receipt',
    state: 'deployed',
    stateLabel: OVIE_ACTIVITY_STATE_LABELS.deployed,
    title: `${ship.linearIssue} deployed`,
    actor: 'dogfood receipt',
    linearIdentifier: ship.linearIssue,
    linearUrl: null,
    prUrl: null,
    digestUrl: null,
    detail: `prod ${ship.prodSha.slice(0, 7)} · receipted ${ship.receiptAt}`,
    updatedAtIso: ship.receiptAt,
    freshness: 'fresh',
  };
}

function digestEntryToFeedRow(
  entry: CustomerChangelogEntry
): OvieActivityFeedRow {
  return {
    id: `digest:${entry.slug}`,
    source: 'public-digest',
    state: 'publicly-available',
    stateLabel: OVIE_ACTIVITY_STATE_LABELS['publicly-available'],
    title: entry.title,
    actor: 'public digest',
    linearIdentifier: null,
    linearUrl: null,
    prUrl: null,
    digestUrl: `${APP_ROUTES.CHANGELOG}#${entry.slug}`,
    detail: `${entry.date} · v${entry.technicalVersion}`,
    updatedAtIso: null,
    freshness: 'fresh',
  };
}

function compareRows(a: OvieActivityFeedRow, b: OvieActivityFeedRow): number {
  const aMs = a.updatedAtIso ? Date.parse(a.updatedAtIso) : null;
  const bMs = b.updatedAtIso ? Date.parse(b.updatedAtIso) : null;
  if (aMs != null && bMs != null && aMs !== bMs) return bMs - aMs;
  if (aMs != null && bMs == null) return -1;
  if (aMs == null && bMs != null) return 1;
  return a.id.localeCompare(b.id);
}

export function emptyOvieActivityFeed(
  availability: Exclude<OvieActivityFeedAvailability, 'available' | 'partial'>
): OvieActivityFeed {
  return { availability, rows: [], truncated: false };
}

/**
 * Merge live Linear-ledger task rows into a feed that already carries
 * GitHub, receipt, and digest rows. Deploy receipts for a Linear issue
 * already tracked as a task are folded into that task's provenance rather
 * than emitted twice.
 */
export function mergeOvieActivityFeed(
  base: OvieActivityFeed,
  tasks: {
    readonly tasks: readonly OvieActivityTask[];
    readonly syncState: OperationalTaskSyncState;
  } | null,
  limit: number = OVIE_ACTIVITY_FEED_LIMIT
): OvieActivityFeed {
  if (!tasks) return base;
  const freshness = syncStateToFreshness(tasks.syncState);
  const receiptsByIssue = new Map<string, OvieActivityFeedRow>();
  for (const row of base.rows) {
    if (row.source === 'deploy-receipt' && row.linearIdentifier) {
      receiptsByIssue.set(row.linearIdentifier, row);
    }
  }
  const taskRows = tasks.tasks.map(task => {
    const row = operationalTaskToFeedRow(task, tasks.syncState);
    const receipt = receiptsByIssue.get(task.linearIdentifier);
    if (receipt && (row.state === 'merged' || row.state === 'in-progress')) {
      return {
        ...row,
        state: 'deployed' as const,
        stateLabel: OVIE_ACTIVITY_STATE_LABELS.deployed,
        detail: receipt.detail,
      };
    }
    return row;
  });
  const taskIdentifiers = new Set(
    taskRows.map(row => row.linearIdentifier).filter(Boolean)
  );
  const kept = base.rows.filter(
    row =>
      !(
        row.source === 'deploy-receipt' &&
        row.linearIdentifier &&
        taskIdentifiers.has(row.linearIdentifier)
      )
  );
  const rows = [...taskRows, ...kept].sort(compareRows).slice(0, limit);
  const availability: OvieActivityFeedAvailability =
    freshness === 'unknown' && base.availability === 'not_configured'
      ? 'not_configured'
      : base.availability;
  return {
    availability,
    rows,
    truncated: base.truncated || taskRows.length + kept.length > limit,
  };
}

export function composeOvieActivityFeed(input: {
  readonly pullRequests: OvieMacHudInFlightPullRequests;
  readonly shippingEntries: readonly unknown[];
  readonly shippingAvailable?: boolean;
  readonly digestEntries: readonly CustomerChangelogEntry[];
  readonly digestAvailable?: boolean;
  readonly limit?: number;
}): OvieActivityFeed {
  const limit = input.limit ?? OVIE_ACTIVITY_FEED_LIMIT;
  const rows: OvieActivityFeedRow[] = [];
  let degraded = false;

  if (input.pullRequests.availability === 'available') {
    for (const pr of input.pullRequests.items) {
      rows.push(inFlightPrToFeedRow(pr));
    }
  } else if (input.pullRequests.availability === 'error') {
    degraded = true;
  }

  if (input.shippingAvailable !== false) {
    for (const entry of input.shippingEntries) {
      const ship = parseReceiptedShip(entry);
      if (ship) rows.push(receiptedShipToFeedRow(ship));
    }
  } else {
    degraded = true;
  }

  if (input.digestAvailable !== false) {
    for (const entry of input.digestEntries.slice(
      0,
      OVIE_ACTIVITY_FEED_DIGEST_LIMIT
    )) {
      rows.push(digestEntryToFeedRow(entry));
    }
  } else {
    degraded = true;
  }

  const sorted = rows.sort(compareRows).slice(0, limit);
  return {
    availability:
      input.pullRequests.availability === 'not_configured' &&
      input.shippingAvailable === false &&
      input.digestAvailable === false
        ? 'not_configured'
        : degraded
          ? 'partial'
          : 'available',
    rows: sorted,
    truncated: rows.length > limit,
  };
}
