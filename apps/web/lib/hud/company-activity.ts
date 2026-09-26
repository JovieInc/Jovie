import type {
  OvieMacHudInFlightPrStatus,
  OvieMacHudInFlightPullRequests,
  OvieMacHudReceiptedShip,
} from '@/lib/hud/ovie-mac-hud';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';

export const COMPANY_ACTIVITY_ROW_LIMIT = 24;

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];
type OperationalTask = OperationalTaskFeed['tasks'][number];

export type CompanyActivityState =
  | 'queued'
  | 'in-progress'
  | 'in-review'
  | 'merge-queued'
  | 'merged'
  | 'deployed'
  | 'public'
  | 'blocked'
  | 'failed';

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
  readonly title: string;
  readonly state: CompanyActivityState;
  readonly actor: string;
  readonly detail: string | null;
  readonly prNumber: number | null;
  readonly receipted: boolean;
  readonly occurredAt: string | null;
  readonly href: string | null;
};

export type CompanyActivityFeedData = {
  readonly rows: readonly CompanyActivityRow[];
  readonly truncated: boolean;
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
    const match = candidate && LINEAR_ID_RE.exec(candidate);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

const normalizeIssueKey = (value: string | null | undefined) =>
  value ? value.trim().toUpperCase() : null;

function taskRow(
  task: OperationalTask,
  receipts: ReadonlyMap<string, OvieMacHudReceiptedShip>
): CompanyActivityRow {
  const linearKey = normalizeIssueKey(task.linearIdentifier);
  const receipted = linearKey != null && receipts.has(linearKey);
  return {
    id: task.id,
    linearIdentifier: task.linearIdentifier,
    title: task.title,
    state: receipted ? 'deployed' : TASK_STATE[task.workflowState],
    actor: 'Symphony',
    detail: null,
    prNumber: null,
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
    title: pr.title,
    state: receipted ? 'deployed' : PR_STATE[pr.status],
    actor: pr.authorLogin ?? 'GitHub',
    detail: pr.statusDetail,
    prNumber: pr.number,
    receipted,
    occurredAt: pr.updatedAtIso,
    href: pr.url,
  };
}

function receiptRow(ship: OvieMacHudReceiptedShip): CompanyActivityRow {
  return {
    id: `receipt:${ship.linearIssue}:${ship.prodSha}`,
    linearIdentifier: extractLinearIdentifier(ship.linearIssue),
    title: `Dogfood receipted ${ship.linearIssue}`,
    state: 'deployed',
    actor: 'Dogfood receipt',
    detail: `prod ${ship.prodSha.slice(0, 7)}`,
    prNumber: null,
    receipted: true,
    occurredAt: ship.receiptAt,
    href: null,
  };
}

function compareRows(a: CompanyActivityRow, b: CompanyActivityRow): number {
  const aTime = a.occurredAt ? Date.parse(a.occurredAt) : Number.NaN;
  const bTime = b.occurredAt ? Date.parse(b.occurredAt) : Number.NaN;
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return bTime - aTime;
  }
  if (Number.isFinite(aTime) !== Number.isFinite(bTime)) {
    return Number.isFinite(aTime) ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

export function composeCompanyActivity(input: {
  readonly operationalTasks?: OperationalTaskFeed | null;
  readonly pullRequests: OvieMacHudInFlightPullRequests;
  readonly receiptedShips?: readonly OvieMacHudReceiptedShip[];
  readonly limit?: number;
}): CompanyActivityFeedData {
  const receipts = new Map<string, OvieMacHudReceiptedShip>();
  const receiptedShips = input.receiptedShips ?? [];
  for (const ship of receiptedShips) {
    const key = normalizeIssueKey(ship.linearIssue);
    if (key) receipts.set(key, ship);
  }

  const claimedKeys = new Set<string>();
  const rows: CompanyActivityRow[] = [];

  for (const task of input.operationalTasks?.tasks ?? []) {
    const row = taskRow(task, receipts);
    if (row.receipted && row.linearIdentifier) {
      claimedKeys.add(row.linearIdentifier);
    }
    rows.push(row);
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

  rows.sort(compareRows);
  const limit = input.limit ?? COMPANY_ACTIVITY_ROW_LIMIT;

  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}
