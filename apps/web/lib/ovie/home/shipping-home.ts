/**
 * Ovie Home shipping projection (JOV-5959).
 *
 * A pure presentation adapter over the existing `ovie.shipping-state.v1`
 * client view and the Ovie inbox. It owns no polling and no source reads:
 * every value comes from `delivery`, `operationalTasks`, or inbox cases that
 * the canonical producers already published. Missing measurements stay
 * missing ("Not measured"), never zero, healthy, or "now".
 */

import {
  HOME_LOOP_NOT_MEASURED,
  type HomeLoopAsk,
  type HomeLoopAttention,
  type HomeLoopConstraint,
  type HomeLoopDoneItem,
  type HomeLoopRow,
  type HomeLoopTile,
  type HomeLoopTileMemory,
  type HomeLoopTone,
  rememberTiles,
  withTileHistory,
} from '@/lib/home-loop/contract';
import type { OvieInbox, OvieInboxCase } from '@/lib/ovie/inbox';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import type {
  CountMeasurement,
  DeliverySummary,
} from '@/lib/ovie/shipping-state/contract';

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];
type OperationalTask = OperationalTaskFeed['tasks'][number];

export const OVIE_SHIP_STAGES = [
  'investigating',
  'building',
  'tested',
  'merging',
  'deployed',
  'verified',
] as const;

export type OvieShipStage = (typeof OVIE_SHIP_STAGES)[number];

export const OVIE_NOT_MEASURED = HOME_LOOP_NOT_MEASURED;

export type OvieHomeTone = HomeLoopTone;
export type OvieShipAttention = HomeLoopAttention;

export interface OvieShipRow extends HomeLoopRow<OvieShipStage> {
  readonly id: OperationalTask['id'];
  readonly pullRequestNumber: number | null;
}

export type OvieDoneItem = HomeLoopDoneItem;
export type OvieConstraint = HomeLoopConstraint;
export type OvieAsk = HomeLoopAsk;

export type OviePulseKey =
  | 'prod'
  | 'merges-today'
  | 'merges-7d'
  | 'lanes'
  | 'queue'
  | 'held'
  | 'gem-disk';

export type OviePulseTile = HomeLoopTile<OviePulseKey>;
export type OviePulseMemory = HomeLoopTileMemory<OviePulseKey>;

export interface OvieHomeShipping {
  readonly stages: typeof OVIE_SHIP_STAGES;
  readonly constraint: OvieConstraint | null;
  readonly pulse: readonly OviePulseTile[];
  readonly rows: readonly OvieShipRow[];
  readonly done: readonly OvieDoneItem[];
  /** Org-wide merges since Pacific midnight; null when not measured. */
  readonly mergesToday: number | null;
  readonly tasksSyncState: OperationalTaskFeed['syncState'];
}

function countValue(measurement: CountMeasurement): number | null {
  return measurement.state === 'not-measured' ? null : measurement.value;
}

function formatCount(value: number | null): string {
  return value === null ? OVIE_NOT_MEASURED : String(value);
}

export function shortSha(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null;
}

/**
 * Map the canonical workflow state onto the founder-facing six-stage path.
 * `in-review` only counts as tested once the head check rollup is green;
 * a red rollup stays in building and is flagged failing.
 */
export function shipStageForTask(task: OperationalTask): {
  readonly stage: OvieShipStage;
  readonly complete: boolean;
  readonly attention: OvieShipAttention;
} {
  const rollup = task.pullRequest?.checks.rollup ?? 'unknown';
  switch (task.workflowState) {
    case 'queued':
      return { stage: 'investigating', complete: false, attention: null };
    case 'blocked':
      return { stage: 'investigating', complete: false, attention: 'blocked' };
    case 'running':
      return {
        stage: 'building',
        complete: false,
        attention: rollup === 'failure' ? 'failing' : null,
      };
    case 'retrying':
      return { stage: 'building', complete: false, attention: 'retrying' };
    case 'in-review':
      if (rollup === 'success')
        return { stage: 'tested', complete: false, attention: null };
      return {
        stage: 'building',
        complete: false,
        attention: rollup === 'failure' ? 'failing' : null,
      };
    case 'merge-queued':
      return { stage: 'merging', complete: false, attention: null };
    case 'merged':
      return { stage: 'deployed', complete: false, attention: null };
    case 'production-verified':
      return { stage: 'verified', complete: true, attention: null };
  }
}

const ATTENTION_RANK: Record<Exclude<OvieShipAttention, null>, number> = {
  blocked: 0,
  failing: 1,
  retrying: 2,
};

/** Attention first (blocked, failing, retrying), then furthest along. */
function compareRows(a: OvieShipRow, b: OvieShipRow): number {
  const aRank = a.attention ? ATTENTION_RANK[a.attention] : 3;
  const bRank = b.attention ? ATTENTION_RANK[b.attention] : 3;
  if (aRank !== bRank) return aRank - bRank;
  if (a.stageIndex !== b.stageIndex) return b.stageIndex - a.stageIndex;
  return a.identifier.localeCompare(b.identifier);
}

function toRow(task: OperationalTask): OvieShipRow {
  const { stage, complete, attention } = shipStageForTask(task);
  return {
    id: task.id,
    identifier: task.linearIdentifier,
    title: task.title,
    url: task.pullRequest?.url ?? task.linearUrl,
    stage,
    stageIndex: OVIE_SHIP_STAGES.indexOf(stage),
    complete,
    attention,
    pullRequestNumber: task.pullRequest?.number ?? null,
    updatedAt: task.updatedAt,
  };
}

function isLanded(task: OperationalTask): boolean {
  return (
    task.workflowState === 'merged' ||
    task.workflowState === 'production-verified'
  );
}

function landedSince(task: OperationalTask, sinceMs: number): boolean {
  if (!task.updatedAt) return false;
  const at = Date.parse(task.updatedAt);
  return Number.isFinite(at) && at >= sinceMs;
}

/**
 * In-flight rows: everything not yet production verified. Merged work stays
 * visible at the deployed stage until verification lands; verified work
 * moves to "done today".
 */
export function buildShipRows(
  feed: OperationalTaskFeed
): readonly OvieShipRow[] {
  return feed.tasks
    .filter(task => task.workflowState !== 'production-verified')
    .map(toRow)
    .sort(compareRows);
}

/**
 * Work that reached merged or production-verified since `todaySince`
 * (Pacific midnight, as published by the merges source). Without a measured
 * day boundary nothing is claimed as done today.
 */
export function buildDoneToday(
  feed: OperationalTaskFeed,
  todaySince: string | null
): readonly OvieDoneItem[] {
  const sinceMs = todaySince ? Date.parse(todaySince) : Number.NaN;
  if (!Number.isFinite(sinceMs)) return [];
  return feed.tasks
    .filter(task => isLanded(task) && landedSince(task, sinceMs))
    .sort(
      (a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? '')
    )
    .map(task => ({
      id: task.id,
      label: task.pullRequest
        ? `${task.title} · #${task.pullRequest.number}`
        : task.title,
      url: task.pullRequest?.url ?? task.linearUrl,
      verified: task.workflowState === 'production-verified',
    }));
}

function sumValues(record: Readonly<Record<string, number>>): number {
  return Object.values(record).reduce((total, value) => total + value, 0);
}

function rawPulse(
  delivery: DeliverySummary
): readonly Omit<OviePulseTile, 'was'>[] {
  const { lanes, merges, production } = delivery;
  const behind = countValue(production.behindMain);
  const prodSha = shortSha(production.sha);
  const today = countValue(merges.today);
  const last7 = countValue(merges.last7Days);
  const prior7 = countValue(merges.prior7Days);
  const running = countValue(lanes.running);
  const slots = countValue(lanes.slots);
  const queue = countValue(delivery.mergeQueueDepth);
  const held = lanes.publishedAt ? sumValues(lanes.heldByReason) : null;
  const disk = lanes.diskFreePct;

  return [
    {
      key: 'prod',
      label: 'Prod',
      value: prodSha ?? OVIE_NOT_MEASURED,
      measured: prodSha !== null,
      tone:
        prodSha === null || behind === null
          ? 'neutral'
          : behind === 0
            ? 'good'
            : 'warn',
    },
    {
      key: 'merges-today',
      label: 'Merges Today',
      value: formatCount(today),
      measured: today !== null,
      tone: today === null ? 'neutral' : today > 0 ? 'good' : 'warn',
    },
    {
      key: 'merges-7d',
      label: 'Merges 7 Days',
      value: formatCount(last7),
      measured: last7 !== null,
      tone:
        last7 === null || prior7 === null
          ? 'neutral'
          : last7 >= prior7
            ? 'good'
            : 'warn',
    },
    {
      key: 'lanes',
      label: 'Lanes',
      value:
        running === null || slots === null
          ? OVIE_NOT_MEASURED
          : `${running}/${slots}`,
      measured: running !== null && slots !== null,
      tone:
        running === null || slots === null || lanes.stale
          ? 'neutral'
          : running > 0
            ? 'good'
            : 'warn',
    },
    {
      key: 'queue',
      label: 'Queue',
      value: formatCount(queue),
      measured: queue !== null,
      tone: 'neutral',
    },
    {
      key: 'held',
      label: 'Held',
      value: formatCount(held),
      measured: held !== null,
      tone: held === null ? 'neutral' : held === 0 ? 'good' : 'bad',
    },
    {
      key: 'gem-disk',
      label: 'Gem Disk Free',
      value: disk === null ? OVIE_NOT_MEASURED : `${Math.round(disk)}%`,
      measured: disk !== null,
      tone:
        disk === null
          ? 'neutral'
          : disk < 5
            ? 'bad'
            : disk < 15
              ? 'warn'
              : 'good',
    },
  ];
}

function sourceWas(
  key: OviePulseKey,
  delivery: DeliverySummary
): string | null {
  if (key === 'merges-7d') {
    const prior = countValue(delivery.merges.prior7Days);
    return prior === null ? null : String(prior);
  }
  return null;
}

/**
 * Pulse tiles with a `was` value. A source-provided comparison wins (merges
 * 7d vs prior 7d); otherwise the last different observed value from
 * `memory`. Unmeasured values never become a `was`.
 */
export function buildPulse(
  delivery: DeliverySummary,
  memory: OviePulseMemory = {}
): readonly OviePulseTile[] {
  return withTileHistory(rawPulse(delivery), memory, key =>
    sourceWas(key, delivery)
  );
}

/** Advance pulse memory with the latest measured observation. */
export function rememberPulse(
  memory: OviePulseMemory,
  pulse: readonly OviePulseTile[]
): OviePulseMemory {
  return rememberTiles(memory, pulse);
}

/**
 * The single highest-severity constraint, named in text. Order: lanes
 * alerts, blocked work, failing checks, production behind main, stale feed.
 */
export function buildConstraint(
  delivery: DeliverySummary,
  rows: readonly OvieShipRow[],
  tasksSyncState: OperationalTaskFeed['syncState']
): OvieConstraint | null {
  const alert = delivery.lanes.alerts.find(text => text.trim().length > 0);
  if (alert) return { tone: 'bad', text: alert.trim() };

  const blocked = rows.filter(row => row.attention === 'blocked').length;
  if (blocked > 0)
    return {
      tone: 'bad',
      text: `${blocked} ${blocked === 1 ? 'item is' : 'items are'} blocked`,
    };

  const failing = rows.filter(row => row.attention === 'failing').length;
  if (failing > 0)
    return {
      tone: 'warn',
      text: `${failing} ${failing === 1 ? 'PR has' : 'PRs have'} failing checks`,
    };

  const behind = countValue(delivery.production.behindMain);
  if (behind !== null && behind > 0)
    return {
      tone: 'warn',
      text: `Production is ${behind} ${behind === 1 ? 'commit' : 'commits'} behind main`,
    };

  if (delivery.lanes.stale)
    return { tone: 'warn', text: 'Lanes feed is stale' };
  if (tasksSyncState === 'failed' || tasksSyncState === 'stale')
    return { tone: 'warn', text: 'Work items are not current' };
  return null;
}

export function buildOvieHomeShipping(input: {
  readonly delivery: DeliverySummary;
  readonly operationalTasks: OperationalTaskFeed;
  readonly pulseMemory?: OviePulseMemory;
}): OvieHomeShipping {
  const { delivery, operationalTasks } = input;
  const since = delivery.merges.since;
  const rows = buildShipRows(operationalTasks);
  return {
    stages: OVIE_SHIP_STAGES,
    constraint: buildConstraint(delivery, rows, operationalTasks.syncState),
    pulse: buildPulse(delivery, input.pulseMemory),
    rows,
    done: buildDoneToday(operationalTasks, since),
    mergesToday: countValue(delivery.merges.today),
    tasksSyncState: operationalTasks.syncState,
  };
}

function askFromCase(item: OvieInboxCase): OvieAsk {
  return {
    id: item.id,
    title: item.title,
    recommendation: item.recommendation,
    why: item.body,
    decidable: item.decisionTarget !== null,
    // Linear asks only accept approval; their discussion lives in Linear.
    canReply:
      item.decisionTarget !== null && item.decisionTarget.kind !== 'linear',
    evidence: item.evidence,
  };
}

/** "Blocked on you": inbox cases that need the founder, in inbox rank order. */
export function buildOvieAsks(inbox: OvieInbox): readonly OvieAsk[] {
  return inbox.cases
    .filter(item => item.state === 'needs_you')
    .map(askFromCase);
}
