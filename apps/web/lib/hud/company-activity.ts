import { APP_ROUTES } from '@/constants/routes';
import type { CustomerChangelogEntry } from '@/lib/customer-changelog';
import type {
  OvieMacHudInFlightPullRequests,
  OvieMacHudReceiptedShip,
} from '@/lib/hud/ovie-mac-hud';
import type {
  OperationalTaskSyncState,
  OperationalTaskWorkflowState,
} from '@/lib/ovie/shipping-state/contract';

/**
 * Ovie company activity feed (JOV-5322).
 *
 * One feed of company work under the three Ovie Mac HUD heroes. Linear is the
 * sole work ledger; the Symphony runtime supplies who is hot; GitHub supplies
 * what landed; receipted ships and the curated public changelog supply the
 * deployed vs publicly-available distinction. Every row exposes its exact
 * state — a merged PR never appears as deployed or publicly available without
 * the matching receipt or curated digest entry. Missing data is unknown,
 * never zero.
 */

export const COMPANY_ACTIVITY_ROW_STATES = [
  'queued',
  'in-progress',
  'in-review',
  'merge-queued',
  'merged',
  'deployed',
  'publicly-available',
  'blocked',
  'failed',
] as const;

export type CompanyActivityRowState =
  (typeof COMPANY_ACTIVITY_ROW_STATES)[number];

export const COMPANY_ACTIVITY_SOURCES = [
  'linear',
  'symphony-runtime',
  'github',
  'public-digest',
] as const;

export type CompanyActivitySource = (typeof COMPANY_ACTIVITY_SOURCES)[number];

export const COMPANY_ACTIVITY_FRESHNESS = [
  'fresh',
  'stale',
  'unknown',
] as const;

export type CompanyActivityFreshness =
  (typeof COMPANY_ACTIVITY_FRESHNESS)[number];

export type CompanyActivityRow = {
  /** Stable cross-source identity (`linear:JOV-1`, `pr:123`, `receipt:sha`). */
  readonly id: string;
  readonly source: CompanyActivitySource;
  /** Who produced the change: Summer/Symphony runtime, GitHub, or curation. */
  readonly actor: 'symphony' | 'github' | 'curated' | 'unknown';
  readonly linearIdentifier: string | null;
  readonly title: string;
  readonly state: CompanyActivityRowState;
  /** Provenance link: Linear issue, PR, or public changelog entry. */
  readonly href: string | null;
  /** Dogfood/production receipt evidence (e.g. short prod SHA), if claimed. */
  readonly receipt: string | null;
  readonly observedAt: string | null;
  readonly freshness: CompanyActivityFreshness;
};

export const COMPANY_ACTIVITY_ROW_LIMIT = 24;
export const COMPANY_ACTIVITY_DIGEST_LIMIT = 6;

/**
 * Structural subset of the shipping-state operational task projection. The
 * client schema brands ids with a runtime regex, not a template literal, so
 * the feed consumes this read-only shape instead of the server contract type.
 */
export type CompanyActivityTask = {
  readonly id: string;
  readonly linearIdentifier: string;
  readonly linearUrl: string | null;
  readonly title: string;
  readonly workflowState: OperationalTaskWorkflowState;
  readonly sourceRevision: string | null;
  readonly updatedAt: string | null;
};

export type CompanyActivityTaskFeed = {
  readonly syncState: OperationalTaskSyncState;
  readonly tasks: readonly CompanyActivityTask[];
};

const TASK_STATE_MAP = {
  queued: 'queued',
  running: 'in-progress',
  retrying: 'in-progress',
  blocked: 'blocked',
  'in-review': 'in-review',
  'merge-queued': 'merge-queued',
  merged: 'merged',
  'production-verified': 'deployed',
} as const satisfies Record<
  OperationalTaskWorkflowState,
  CompanyActivityRowState
>;

const PR_STATE_MAP = {
  open: 'in-progress',
  in_review: 'in-review',
  merge_queue: 'merge-queued',
  blocked: 'blocked',
} as const satisfies Record<
  OvieMacHudInFlightPullRequests['items'][number]['status'],
  CompanyActivityRowState
>;

function taskFeedFreshness(
  syncState: OperationalTaskSyncState
): CompanyActivityFreshness {
  if (syncState === 'fresh') return 'fresh';
  if (syncState === 'stale') return 'stale';
  return 'unknown';
}

function taskRow(
  task: CompanyActivityTask,
  freshness: CompanyActivityFreshness
): CompanyActivityRow {
  return {
    id: task.id,
    source: 'linear',
    actor: 'symphony',
    linearIdentifier: task.linearIdentifier,
    title: task.title,
    state: TASK_STATE_MAP[task.workflowState],
    href: task.linearUrl,
    receipt:
      task.workflowState === 'production-verified'
        ? (task.sourceRevision ?? null)
        : null,
    observedAt: task.updatedAt,
    freshness,
  };
}

function pullRequestRow(
  pr: OvieMacHudInFlightPullRequests['items'][number]
): CompanyActivityRow {
  return {
    id: `pr:${pr.number}`,
    source: 'github',
    actor: 'github',
    linearIdentifier: null,
    title: pr.title,
    state: PR_STATE_MAP[pr.status],
    href: pr.url,
    receipt: null,
    observedAt: pr.updatedAtIso,
    freshness: 'fresh',
  };
}

function receiptRow(ship: OvieMacHudReceiptedShip): CompanyActivityRow {
  return {
    id: `receipt:${ship.prodSha}`,
    source: 'symphony-runtime',
    actor: 'symphony',
    linearIdentifier: `JOV-${ship.linearIssue}`,
    title: 'Verified ship receipt',
    state: 'deployed',
    href: null,
    receipt: ship.prodSha.slice(0, 7),
    observedAt: ship.receiptAt,
    freshness: 'fresh',
  };
}

function digestRow(entry: CustomerChangelogEntry): CompanyActivityRow {
  return {
    id: `digest:${entry.slug}`,
    source: 'public-digest',
    actor: 'curated',
    linearIdentifier: null,
    title: entry.title,
    state: 'publicly-available',
    href: `${APP_ROUTES.CHANGELOG}/${entry.technicalVersion}`,
    receipt: null,
    observedAt: entry.date,
    freshness: 'fresh',
  };
}

function observedMs(value: string | null): number {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
}

export function composeCompanyActivityRows(input: {
  readonly operationalTasks: CompanyActivityTaskFeed | null;
  readonly inFlightPullRequests: OvieMacHudInFlightPullRequests;
  readonly shippedReceipts: readonly OvieMacHudReceiptedShip[];
  readonly receiptsAvailable: boolean;
  readonly publicDigest: readonly CustomerChangelogEntry[];
  readonly maxRows?: number;
}): readonly CompanyActivityRow[] {
  const rows: CompanyActivityRow[] = [];

  const feed = input.operationalTasks;
  if (feed) {
    const freshness = taskFeedFreshness(feed.syncState);
    for (const task of feed.tasks) rows.push(taskRow(task, freshness));
  }

  if (input.inFlightPullRequests.availability === 'available') {
    for (const pr of input.inFlightPullRequests.items) {
      rows.push(pullRequestRow(pr));
    }
  }

  if (input.receiptsAvailable) {
    for (const ship of input.shippedReceipts) rows.push(receiptRow(ship));
  }

  for (const entry of input.publicDigest) rows.push(digestRow(entry));

  rows.sort((a, b) => observedMs(b.observedAt) - observedMs(a.observedAt));
  return rows.slice(0, input.maxRows ?? COMPANY_ACTIVITY_ROW_LIMIT);
}
