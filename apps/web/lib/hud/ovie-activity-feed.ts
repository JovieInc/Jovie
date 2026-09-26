import { parseReceiptedShip } from '@/lib/hud/ovie-mac-hud';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';

type OperationalFeedTask =
  ShippingCockpitProjection['operationalTasks']['tasks'][number];

export const OVIE_ACTIVITY_ROW_LIMIT = 12;
export const OVIE_ACTIVITY_PUBLIC_UPDATE_LIMIT = 3;

export const OVIE_ACTIVITY_STATES = [
  'queued',
  'in-progress',
  'merged',
  'deployed',
  'public',
  'blocked',
  'failed',
] as const;

export type OvieActivityState = (typeof OVIE_ACTIVITY_STATES)[number];

export type OvieActivityFreshness = 'fresh' | 'stale' | 'unknown';

export type OvieActivityRow = {
  readonly key: string;
  readonly title: string;
  readonly linearIdentifier: string | null;
  readonly state: OvieActivityState;
  readonly stateLabel: string;
  readonly sourceLabel: string;
  readonly detail: string | null;
  readonly href: string | null;
  readonly prUrl: string | null;
  readonly occurredAtIso: string | null;
  readonly freshness: OvieActivityFreshness;
};

export type OvieActivityPublicUpdate = {
  readonly title: string;
  readonly date: string;
  readonly url: string;
};

export type OvieActivityObservation =
  | 'ok'
  | 'empty'
  | 'syncing'
  | 'unavailable';

export type OvieActivityFeed = {
  readonly rows: readonly OvieActivityRow[];
  readonly observation: OvieActivityObservation;
};

export type OvieActivityOperationalFeed = Pick<
  ShippingCockpitProjection['operationalTasks'],
  'syncState' | 'tasks'
>;

const STATE_LABELS: Record<OvieActivityState, string> = {
  queued: 'Queued',
  'in-progress': 'In Progress',
  merged: 'Merged',
  deployed: 'Deployed',
  public: 'Public',
  blocked: 'Blocked',
  failed: 'Failed',
};

const TASK_STATE_MAP: Record<
  OperationalFeedTask['workflowState'],
  OvieActivityState
> = {
  queued: 'queued',
  'merge-queued': 'queued',
  running: 'in-progress',
  retrying: 'in-progress',
  'in-review': 'in-progress',
  merged: 'merged',
  'production-verified': 'deployed',
  blocked: 'blocked',
};

const LINEAR_ID_RE = /([A-Z]+-\d+)/;

function normalizeLinearIdentifier(value: string | null): string | null {
  if (!value) return null;
  const match = LINEAR_ID_RE.exec(value.toUpperCase());
  return match ? match[1] : null;
}

function feedFreshness(
  syncState: OvieActivityOperationalFeed['syncState']
): OvieActivityFreshness {
  if (syncState === 'fresh') return 'fresh';
  if (syncState === 'stale') return 'stale';
  return 'unknown';
}

function taskDetail(task: OperationalFeedTask): string | null {
  const parts: string[] = [];
  if (task.attempt != null && task.attempt > 1) {
    parts.push(`Attempt ${task.attempt}`);
  }
  if (task.retryAt) parts.push('Retry scheduled');
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function composeOvieActivityFeed(input: {
  readonly operational: OvieActivityOperationalFeed | null;
  readonly receipts: readonly unknown[];
  readonly receiptsAvailable: boolean;
  readonly publicUpdates: readonly OvieActivityPublicUpdate[];
  readonly limit?: number;
}): OvieActivityFeed {
  const limit = input.limit ?? OVIE_ACTIVITY_ROW_LIMIT;
  const rows: OvieActivityRow[] = [];
  const receiptedIdentifiers = new Set<string>();

  for (const entry of input.receipts) {
    const ship = parseReceiptedShip(entry);
    if (!ship) continue;
    const identifier = normalizeLinearIdentifier(ship.linearIssue);
    if (identifier) receiptedIdentifiers.add(identifier);
    rows.push({
      key: `receipt:${ship.linearIssue}:${ship.receiptAt}`,
      title: 'Landed on production',
      linearIdentifier: identifier,
      state: 'deployed',
      stateLabel: STATE_LABELS.deployed,
      sourceLabel: 'Dogfood receipt',
      detail: `prod ${ship.prodSha.slice(0, 7)} · mq ${ship.mergeQueueRef}`,
      href: null,
      prUrl: null,
      occurredAtIso: ship.receiptAt,
      freshness: 'fresh',
    });
  }

  const operational = input.operational;
  if (operational) {
    const freshness = feedFreshness(operational.syncState);
    for (const task of operational.tasks) {
      const state = TASK_STATE_MAP[task.workflowState];
      const covered =
        state === 'deployed' && receiptedIdentifiers.has(task.linearIdentifier);
      if (covered) continue;
      rows.push({
        key: `task:${task.id}`,
        title: task.title,
        linearIdentifier: task.linearIdentifier,
        state,
        stateLabel: STATE_LABELS[state],
        sourceLabel: 'Symphony runtime',
        detail: taskDetail(task),
        href: task.linearUrl,
        prUrl: null,
        occurredAtIso: task.updatedAt,
        freshness,
      });
    }
  }

  for (const update of input.publicUpdates) {
    rows.push({
      key: `public:${update.url}:${update.title}`,
      title: update.title,
      linearIdentifier: null,
      state: 'public',
      stateLabel: STATE_LABELS.public,
      sourceLabel: 'Public digest',
      detail: null,
      href: update.url,
      prUrl: null,
      occurredAtIso: update.date,
      freshness: 'fresh',
    });
  }

  rows.sort((a, b) => {
    const aMs = a.occurredAtIso ? Date.parse(a.occurredAtIso) : Number.NaN;
    const bMs = b.occurredAtIso ? Date.parse(b.occurredAtIso) : Number.NaN;
    if (Number.isNaN(aMs) && Number.isNaN(bMs)) return 0;
    if (Number.isNaN(aMs)) return 1;
    if (Number.isNaN(bMs)) return -1;
    return bMs - aMs;
  });

  const shown = rows.slice(0, limit);

  let observation: OvieActivityObservation;
  if (shown.length > 0) {
    observation = 'ok';
  } else if (!operational || operational.syncState === 'syncing') {
    observation = 'syncing';
  } else if (operational.syncState === 'failed' && !input.receiptsAvailable) {
    observation = 'unavailable';
  } else {
    observation = 'empty';
  }

  return { rows: shown, observation };
}
