import { APP_ROUTES } from '@/constants/routes';
import type {
  OvieMacHudInFlightPrStatus,
  OvieMacHudInFlightPullRequests,
  OvieMacHudPublicDigest,
  OvieMacHudReceiptedShip,
} from '@/lib/hud/ovie-mac-hud';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';

export const COMPANY_ACTIVITY_ROW_LIMIT = 24;

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];
type OperationalTask = OperationalTaskFeed['tasks'][number];

export const COMPANY_ACTIVITY_STATES = [
  'queued',
  'in-progress',
  'in-review',
  'merge-queued',
  'merged',
  'deployed',
  'public',
  'blocked',
  'failed',
] as const;

export type CompanyActivityState = (typeof COMPANY_ACTIVITY_STATES)[number];

export const COMPANY_ACTIVITY_STATE_LABELS: Record<
  CompanyActivityState,
  string
> = {
  queued: 'Queued',
  'in-progress': 'In Progress',
  'in-review': 'In Review',
  'merge-queued': 'Merge Queued',
  merged: 'Merged',
  deployed: 'Deployed',
  public: 'Public',
  blocked: 'Blocked',
  failed: 'Failed',
};

export type CompanyActivityRow = {
  readonly id: string;
  readonly linearIdentifier: string | null;
  readonly linearUrl: string | null;
  readonly title: string;
  readonly state: CompanyActivityState;
  readonly actor: string;
  readonly detail: string | null;
  readonly prNumber: number | null;
  readonly prUrl: string | null;
  readonly receipted: boolean;
  readonly occurredAt: string | null;
  readonly href: string | null;
};

export type CompanyActivitySourceId =
  | 'linear'
  | 'github'
  | 'receipts'
  | 'digest';

export type CompanyActivitySourceStatus =
  | 'ok'
  | 'empty'
  | 'stale'
  | 'unavailable';

export type CompanyActivityFeedData = {
  readonly rows: readonly CompanyActivityRow[];
  readonly truncated: boolean;
  readonly sources: Readonly<
    Record<CompanyActivitySourceId, CompanyActivitySourceStatus>
  >;
};

const TASK_STATE: Record<
  OperationalTask['workflowState'],
  CompanyActivityState
> = {
  queued: 'queued',
  running: 'in-progress',
  retrying: 'in-progress',
  blocked: 'blocked',
  'in-review': 'in-review',
  'merge-queued': 'merge-queued',
  merged: 'merged',
  'production-verified': 'deployed',
};

const TASK_STATE_LABELS: Record<OperationalTask['workflowState'], string> = {
  queued: 'Queued',
  running: 'In Progress',
  retrying: 'Retrying',
  blocked: 'Blocked',
  'in-review': 'In Review',
  'merge-queued': 'Merge Queued',
  merged: 'Merged',
  'production-verified': 'Deployed',
};

const PR_STATE: Record<OvieMacHudInFlightPrStatus, CompanyActivityState> = {
  open: 'in-progress',
  in_review: 'in-review',
  merge_queue: 'merge-queued',
  blocked: 'blocked',
};

const LINEAR_ID_RE = /\b([a-z]+-\d+)\b/i;

function extractLinearIdentifier(
  ...candidates: readonly (string | null | undefined)[]
): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = LINEAR_ID_RE.exec(candidate);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

function normalizeIssueKey(value: string | null | undefined): string | null {
  return value ? value.trim().toUpperCase() : null;
}

function latestDeltasByTask(
  feed: OperationalTaskFeed
): Map<string, OperationalTaskFeed['deltas'][number]> {
  const latest = new Map<string, OperationalTaskFeed['deltas'][number]>();
  for (const delta of feed.deltas) {
    const existing = latest.get(delta.taskId);
    if (!existing || delta.sequence > existing.sequence) {
      latest.set(delta.taskId, delta);
    }
  }
  return latest;
}

function taskRow(
  task: OperationalTask,
  feed: OperationalTaskFeed,
  deltas: ReadonlyMap<string, OperationalTaskFeed['deltas'][number]>,
  receipts: ReadonlyMap<string, OvieMacHudReceiptedShip>
): CompanyActivityRow {
  const delta = deltas.get(task.id);
  const linearKey = normalizeIssueKey(task.linearIdentifier);
  const receipted = linearKey != null && receipts.has(linearKey);
  let detail: string | null = null;
  if (delta?.fromState && delta.toState) {
    detail = `${TASK_STATE_LABELS[delta.fromState]} → ${TASK_STATE_LABELS[delta.toState]}`;
  } else if (delta?.kind === 'added') {
    detail = 'New';
  }

  return {
    id: task.id,
    linearIdentifier: task.linearIdentifier,
    linearUrl: task.linearUrl,
    title: task.title,
    state: receipted ? 'deployed' : TASK_STATE[task.workflowState],
    actor: 'Symphony',
    detail,
    prNumber: null,
    prUrl: null,
    receipted,
    occurredAt: task.updatedAt,
    href: task.linearUrl,
  };
}

function pullRequestRow(
  pr: OvieMacHudInFlightPullRequests['items'][number],
  receipts: ReadonlyMap<string, OvieMacHudReceiptedShip>
): CompanyActivityRow {
  const linearIdentifier = extractLinearIdentifier(pr.headRefName, pr.title);
  const receipted = linearIdentifier != null && receipts.has(linearIdentifier);
  return {
    id: `github:pr:${pr.number}`,
    linearIdentifier,
    linearUrl: null,
    title: pr.title,
    state: receipted ? 'deployed' : PR_STATE[pr.status],
    actor: pr.authorLogin ?? 'GitHub',
    detail: pr.statusDetail,
    prNumber: pr.number,
    prUrl: pr.url,
    receipted,
    occurredAt: pr.updatedAtIso,
    href: pr.url,
  };
}

function receiptRow(ship: OvieMacHudReceiptedShip): CompanyActivityRow {
  const linearIdentifier = extractLinearIdentifier(ship.linearIssue);
  return {
    id: `receipt:${ship.linearIssue}:${ship.prodSha}`,
    linearIdentifier,
    linearUrl: null,
    title: `Dogfood receipted ${ship.linearIssue}`,
    state: 'deployed',
    actor: 'Dogfood receipt',
    detail: `prod ${ship.prodSha.slice(0, 7)}`,
    prNumber: null,
    prUrl: null,
    receipted: true,
    occurredAt: ship.receiptAt,
    href: null,
  };
}

function digestRow(
  item: OvieMacHudPublicDigest['items'][number]
): CompanyActivityRow {
  return {
    id: `digest:${item.slug}`,
    linearIdentifier: extractLinearIdentifier(item.title),
    linearUrl: null,
    title: item.title,
    state: 'public',
    actor: "What's New",
    detail: `v${item.technicalVersion}`,
    prNumber: null,
    prUrl: null,
    receipted: false,
    occurredAt: item.date ? `${item.date}T00:00:00.000Z` : null,
    href: `${APP_ROUTES.CHANGELOG}#${item.slug}`,
  };
}

function linearSourceStatus(
  feed: OperationalTaskFeed | null | undefined
): CompanyActivitySourceStatus {
  if (!feed) return 'unavailable';
  switch (feed.syncState) {
    case 'fresh':
      return feed.tasks.length === 0 ? 'empty' : 'ok';
    case 'stale':
      return 'stale';
    case 'syncing':
      return feed.tasks.length === 0 ? 'unavailable' : 'stale';
    case 'failed':
      return 'unavailable';
  }
}

function compareRows(a: CompanyActivityRow, b: CompanyActivityRow): number {
  const aTime = a.occurredAt ? Date.parse(a.occurredAt) : Number.NaN;
  const bTime = b.occurredAt ? Date.parse(b.occurredAt) : Number.NaN;
  const aValid = Number.isFinite(aTime);
  const bValid = Number.isFinite(bTime);
  if (aValid && bValid && aTime !== bTime) return bTime - aTime;
  if (aValid !== bValid) return aValid ? -1 : 1;
  return a.id.localeCompare(b.id);
}

export function composeCompanyActivity(input: {
  readonly operationalTasks?: OperationalTaskFeed | null;
  readonly pullRequests: OvieMacHudInFlightPullRequests;
  readonly receiptedShips?: readonly OvieMacHudReceiptedShip[];
  readonly receiptsAvailable?: boolean;
  readonly publicDigest?: OvieMacHudPublicDigest | null;
  readonly limit?: number;
}): CompanyActivityFeedData {
  const receipts = new Map<string, OvieMacHudReceiptedShip>();
  const receiptedShips = input.receiptedShips ?? [];
  for (const ship of receiptedShips) {
    const key = normalizeIssueKey(ship.linearIssue);
    if (key) receipts.set(key, ship);
  }

  const feed = input.operationalTasks ?? null;
  const deltas = feed ? latestDeltasByTask(feed) : new Map();
  const claimedKeys = new Set<string>();

  const rows: CompanyActivityRow[] = [];
  if (feed) {
    for (const task of feed.tasks) {
      const row = taskRow(task, feed, deltas, receipts);
      if (row.receipted && row.linearIdentifier) {
        claimedKeys.add(row.linearIdentifier);
      }
      rows.push(row);
    }
  }

  if (input.pullRequests.availability === 'available') {
    for (const pr of input.pullRequests.items) {
      const row = pullRequestRow(pr, receipts);
      if (row.receipted && row.linearIdentifier) {
        claimedKeys.add(row.linearIdentifier);
      }
      rows.push(row);
    }
  }

  for (const ship of receiptedShips) {
    const key = normalizeIssueKey(ship.linearIssue);
    if (key && claimedKeys.has(key)) continue;
    rows.push(receiptRow(ship));
  }

  if (input.publicDigest?.availability === 'available') {
    for (const item of input.publicDigest.items) {
      rows.push(digestRow(item));
    }
  }

  rows.sort(compareRows);
  const limit = input.limit ?? COMPANY_ACTIVITY_ROW_LIMIT;

  const githubStatus: CompanyActivitySourceStatus =
    input.pullRequests.availability === 'available'
      ? input.pullRequests.items.length === 0
        ? 'empty'
        : 'ok'
      : 'unavailable';
  const receiptsStatus: CompanyActivitySourceStatus =
    input.receiptsAvailable === false
      ? 'unavailable'
      : receiptedShips.length === 0
        ? 'empty'
        : 'ok';
  const digestStatus: CompanyActivitySourceStatus =
    input.publicDigest?.availability === 'available'
      ? input.publicDigest.items.length === 0
        ? 'empty'
        : 'ok'
      : 'unavailable';

  return {
    rows: rows.slice(0, limit),
    truncated: rows.length > limit,
    sources: {
      linear: linearSourceStatus(feed),
      github: githubStatus,
      receipts: receiptsStatus,
      digest: digestStatus,
    },
  };
}
