/**
 * Ovie Home shipping projection (JOV-5959).
 *
 * A pure presentation adapter over the existing `ovie.shipping-state.v1`
 * client view and the Ovie inbox. It owns no polling and no source reads:
 * every value comes from `delivery`, `operationalTasks`, or inbox cases that
 * the canonical producers already published. Missing measurements stay
 * missing ("Not measured"), never zero, healthy, or "now".
 */

import { APP_ROUTES } from '@/constants/routes';
import {
  formatDurationSeconds,
  HOME_LOOP_NOT_MEASURED,
  type HomeLoopAsk,
  type HomeLoopAttention,
  type HomeLoopConstraint,
  type HomeLoopDoneItem,
  type HomeLoopLatencyRow,
  type HomeLoopRow,
  type HomeLoopTile,
  type HomeLoopTileMemory,
  type HomeLoopTone,
  withTileHistory,
} from '@/lib/home-loop/contract';
import { OVIE_CERTIFICATION_TIER_LABELS } from '@/lib/ovie/certifications/types';
import type {
  InboxDecisionTarget,
  OvieInbox,
  OvieInboxCase,
} from '@/lib/ovie/inbox';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import type {
  CountMeasurement,
  DeliveryMergedPullRequest,
  DeliverySummary,
  StageSummary,
} from '@/lib/ovie/shipping-state/contract';
import { fleetVerdict } from './fleet-verdict';

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

/** Priority order: the row shows as many as fit, left to right. */
export type OviePulseKey =
  | 'merges-day'
  | 'ejections'
  | 'prod'
  | 'lyb-deploy'
  | 'lanes'
  | 'ownerless';

export type OviePulseTile = HomeLoopTile<OviePulseKey>;

/**
 * Throughput targets. Values mirror `docs/metrics/shipping-slo-baseline.json`
 * (the SLO ratchet owns them; `throughput-targets.test.ts` fails on drift).
 * A tile without a target is a raw counter, and Home does not show those.
 */
export const OVIE_THROUGHPUT_TARGETS = {
  mergesPerDay: 20,
  queueEjectionRate: 0.1,
  productionBehindMain: 0,
  ownerless: 0,
} as const;

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

const LYB_REPO = 'JovieInc/LogYourBody';

/**
 * LogYourBody production deploy health from the lanes feed's `deployHealth`
 * block. Missing stays missing, never healthy.
 */
function lybDeploy(health: DeliverySummary['lanes']['deployHealth']): {
  readonly value: string;
  readonly measured: boolean;
  readonly tone: OviePulseTile['tone'];
} {
  const repo = health?.repos.find(row => row.repo === LYB_REPO);
  if (!repo || repo.status === 'unknown')
    return { value: OVIE_NOT_MEASURED, measured: false, tone: 'neutral' };
  if (repo.status === 'failing')
    return {
      value:
        repo.behindMain === null
          ? 'Failing'
          : `Failing, ${repo.behindMain} behind`,
      measured: true,
      tone: 'bad',
    };
  if (repo.behindMain === null)
    return { value: OVIE_NOT_MEASURED, measured: false, tone: 'neutral' };
  return {
    value: repo.behindMain === 0 ? 'Current' : `${repo.behindMain} behind`,
    measured: true,
    tone: repo.behindMain === 0 ? 'good' : 'warn',
  };
}

function behindLabel(behind: number): string {
  return behind === 0 ? 'Current' : `${behind} behind`;
}

/** Inside `target` is good, up to `badAbove` is warn, past it is bad. */
function toneAtMost(
  value: number,
  target: number,
  badAbove: number
): OvieHomeTone {
  if (value <= target) return 'good';
  return value > badAbove ? 'bad' : 'warn';
}

function toneAtLeast(value: number, target: number): OvieHomeTone {
  if (value >= target) return 'good';
  return value < target / 2 ? 'bad' : 'warn';
}

function perDay(measurement: CountMeasurement): number | null {
  const week = countValue(measurement);
  return week === null ? null : Math.round(week / 7);
}

const TARGETS = OVIE_THROUGHPUT_TARGETS;

function rawPulse(
  delivery: DeliverySummary
): readonly Omit<OviePulseTile, 'was'>[] {
  const { lanes, production } = delivery;
  const flow = lanes.flow ?? null;
  const mergesPerDay = perDay(delivery.merges.last7Days);
  const ejection = flow?.queueEjectionRate ?? null;
  const behind = countValue(production.behindMain);
  const running = countValue(lanes.running);
  const slots = countValue(lanes.slots);
  const ownerless = flow?.ownerless ?? null;
  const lyb = lybDeploy(lanes.deployHealth);
  const shipping = APP_ROUTES.ADMIN_SHIPPING;
  const fleet = APP_ROUTES.ADMIN_OPERATIONS;

  return [
    {
      key: 'merges-day',
      label: 'Merges / day (7d)',
      value: mergesPerDay === null ? OVIE_NOT_MEASURED : String(mergesPerDay),
      measured: mergesPerDay !== null,
      tone:
        mergesPerDay === null
          ? 'neutral'
          : toneAtLeast(mergesPerDay, TARGETS.mergesPerDay),
      target: `Target ≥ ${TARGETS.mergesPerDay}`,
      href: shipping,
    },
    {
      key: 'ejections',
      label: 'Queue ejections',
      value:
        ejection === null
          ? OVIE_NOT_MEASURED
          : `${Math.round(ejection * 100)}%`,
      measured: ejection !== null,
      tone:
        ejection === null
          ? 'neutral'
          : toneAtMost(
              ejection,
              TARGETS.queueEjectionRate,
              TARGETS.queueEjectionRate * 2
            ),
      target: `Target ≤ ${Math.round(TARGETS.queueEjectionRate * 100)}%`,
      href: shipping,
    },
    {
      key: 'prod',
      label: 'Jovie prod',
      value: behind === null ? OVIE_NOT_MEASURED : behindLabel(behind),
      measured: behind !== null,
      tone:
        behind === null
          ? 'neutral'
          : toneAtMost(behind, TARGETS.productionBehindMain, 20),
      target: 'Target current',
      href: shipping,
    },
    {
      key: 'lyb-deploy',
      label: 'LYB prod',
      value: lyb.value,
      measured: lyb.measured,
      tone: lyb.tone,
      target: 'Target current',
      href: fleet,
    },
    {
      key: 'lanes',
      label: 'Lanes busy',
      value:
        running === null || slots === null
          ? OVIE_NOT_MEASURED
          : `${running} of ${slots}`,
      measured: running !== null && slots !== null,
      tone:
        running === null || slots === null || lanes.stale
          ? 'neutral'
          : toneAtLeast(running, slots),
      target: slots === null ? null : `Target ${slots} of ${slots}`,
      href: fleet,
    },
    {
      key: 'ownerless',
      label: 'Ownerless PRs',
      value: ownerless === null ? OVIE_NOT_MEASURED : String(ownerless),
      measured: ownerless !== null,
      tone:
        ownerless === null
          ? 'neutral'
          : toneAtMost(ownerless, TARGETS.ownerless, 2),
      target: `Target ${TARGETS.ownerless}`,
      href: shipping,
    },
  ];
}

function sourceWas(
  key: OviePulseKey,
  delivery: DeliverySummary
): string | null {
  if (key === 'merges-day') {
    const prior = perDay(delivery.merges.prior7Days);
    return prior === null ? null : `${prior} prior 7d`;
  }
  return null;
}

/**
 * Throughput tiles, each with a target and a state. `was` is the source's
 * own comparison (merges vs the prior 7 days) or the value at Tim's last
 * visit from `memory`. Unmeasured values never become a `was`.
 */
export function buildPulse(
  delivery: DeliverySummary,
  memory: OviePulseMemory = {}
): readonly OviePulseTile[] {
  return withTileHistory(rawPulse(delivery), memory, key =>
    sourceWas(key, delivery)
  );
}

/** Inputs the verdict needs before it may say shipping is on target. */
const VERDICT_INPUTS: readonly OviePulseKey[] = [
  'merges-day',
  'ejections',
  'prod',
  'lanes',
];

const PULSE_NAMES: Record<OviePulseKey, string> = {
  'merges-day': 'merges',
  ejections: 'queue ejections',
  prod: 'production',
  'lyb-deploy': 'LYB production',
  lanes: 'lanes',
  ownerless: 'ownerless PRs',
};

function breachText(tile: OviePulseTile): string {
  switch (tile.key) {
    case 'merges-day':
      return `${tile.value} merges/day (target ${TARGETS.mergesPerDay})`;
    case 'ejections':
      return `${tile.value} of queue entries ejected (target ${Math.round(TARGETS.queueEjectionRate * 100)}%)`;
    case 'prod':
      return `Jovie prod ${tile.value === 'Current' ? 'current' : `${tile.value} main`}`;
    case 'lyb-deploy':
      return `LYB prod ${tile.value.toLowerCase()}`;
    case 'lanes':
      return `${tile.value} lanes busy`;
    case 'ownerless':
      return `${tile.value} ownerless PRs`;
  }
}

/**
 * The header verdict, computed from the same evidence as the tiles. It may
 * only say shipping is on target when every required input is measured and
 * inside its target; anything missing says so, and any breach is named
 * worst first. It never falls back to "nothing is blocking".
 */
export function buildConstraint(
  delivery: DeliverySummary,
  rows: readonly OvieShipRow[],
  tasksSyncState: OperationalTaskFeed['syncState'],
  pulse: readonly OviePulseTile[] = buildPulse(delivery)
): OvieConstraint | null {
  const breaches: {
    tone: 'bad' | 'warn';
    text: string;
    href?: string;
  }[] = [];
  // The fleet is one input among the rest, so a doctor alert can no longer
  // hide a 58% queue ejection rate behind it.
  const fleet = fleetVerdict(delivery.lanes);
  if (fleet.level === 'down')
    breaches.push({
      tone: 'bad',
      text: 'fleet not reporting',
      href: APP_ROUTES.ADMIN_OPERATIONS,
    });
  else if (fleet.level === 'degraded')
    breaches.push({
      tone: 'bad',
      text: `fleet degraded (${fleet.reasons.length} ${fleet.reasons.length === 1 ? 'alert' : 'alerts'})`,
      href: APP_ROUTES.ADMIN_OPERATIONS,
    });
  for (const tile of pulse) {
    if (tile.tone === 'bad' || tile.tone === 'warn')
      breaches.push({ tone: tile.tone, text: breachText(tile) });
  }
  const blocked = rows.filter(row => row.attention === 'blocked').length;
  if (blocked > 0)
    breaches.push({
      tone: 'bad',
      text: `${blocked} ${blocked === 1 ? 'item' : 'items'} blocked`,
    });
  const failing = rows.filter(row => row.attention === 'failing').length;
  if (failing > 0)
    breaches.push({
      tone: 'warn',
      text: `${failing} ${failing === 1 ? 'PR' : 'PRs'} failing checks`,
    });

  if (breaches.length > 0) {
    const ordered = [
      ...breaches.filter(b => b.tone === 'bad'),
      ...breaches.filter(b => b.tone === 'warn'),
    ];
    const shown = ordered.slice(0, 2).map(b => b.text);
    const more = ordered.length - shown.length;
    return {
      tone: ordered[0]?.tone ?? 'warn',
      text: `Shipping off target: ${shown.join(' · ')}${more > 0 ? ` · +${more} more` : ''}`,
      detailsHref: ordered[0]?.href ?? APP_ROUTES.ADMIN_SHIPPING,
    };
  }

  const missing = VERDICT_INPUTS.filter(
    key => !pulse.find(tile => tile.key === key)?.measured
  ).map(key => PULSE_NAMES[key]);
  if (tasksSyncState !== 'fresh') missing.push('work items');
  if (missing.length > 0)
    return {
      tone: 'warn',
      text: `Shipping health unknown: ${missing.join(', ')} not measured`,
      detailsHref: APP_ROUTES.ADMIN_SHIPPING,
    };
  return null;
}

/**
 * Add today's merged PRs that no task already names. Task items come first
 * (they carry verification); merged-only PRs are "landed", not verified.
 */
export function mergeDoneWithRecent(
  done: readonly OvieDoneItem[],
  recent: readonly DeliveryMergedPullRequest[],
  limit = 12
): readonly OvieDoneItem[] {
  const named = new Set(
    done.map(item => /#(\d+)$/.exec(item.label)?.[1]).filter(Boolean)
  );
  const extra = recent
    .filter(pr => !named.has(String(pr.number)))
    .map(pr => ({
      id: `pr:${pr.repo}#${pr.number}`,
      label: `${pr.title} · #${pr.number}`,
      url: pr.url,
      verified: false,
    }));
  return [...done, ...extra].slice(0, limit);
}

export function buildOvieHomeShipping(input: {
  readonly delivery: DeliverySummary;
  readonly operationalTasks: OperationalTaskFeed;
  readonly pulseMemory?: OviePulseMemory;
}): OvieHomeShipping {
  const { delivery, operationalTasks } = input;
  const since = delivery.merges.since;
  const rows = buildShipRows(operationalTasks);
  const pulse = buildPulse(delivery, input.pulseMemory);
  return {
    stages: OVIE_SHIP_STAGES,
    constraint: buildConstraint(
      delivery,
      rows,
      operationalTasks.syncState,
      pulse
    ),
    pulse,
    rows,
    done: mergeDoneWithRecent(
      buildDoneToday(operationalTasks, since),
      delivery.merges.recent ?? []
    ),
    mergesToday: countValue(delivery.merges.today),
    tasksSyncState: operationalTasks.syncState,
  };
}

/**
 * Same primary verbs as the inbox drawer. Home must not call a Linear close
 * or a founder certification an approval.
 */
export function ovieAskAction(kind: InboxDecisionTarget['kind'] | undefined): {
  readonly actionLabel: string;
  readonly committedLabel: string;
} {
  switch (kind) {
    case 'linear':
      return { actionLabel: 'Mark done', committedLabel: 'Marked done' };
    case 'certification':
      return { actionLabel: 'Certify', committedLabel: 'Certified' };
    default:
      return { actionLabel: 'Approve', committedLabel: 'Approved' };
  }
}

/** `jovie.decision-default/v1` as the inbox publishes it (PR #22371). */
type InboxDecisionDefaultWire = {
  readonly contract?: unknown;
  readonly decision?: unknown;
  readonly summary?: unknown;
  readonly deadline?: unknown;
  readonly declared?: unknown;
};

function decisionDefaultOf(item: OvieInboxCase): OvieAsk['decisionDefault'] {
  const wire = (
    item as { readonly decisionDefault?: InboxDecisionDefaultWire | null }
  ).decisionDefault;
  if (
    !wire ||
    wire.contract !== 'jovie.decision-default/v1' ||
    (wire.decision !== 'approve' && wire.decision !== 'reject') ||
    typeof wire.summary !== 'string' ||
    typeof wire.deadline !== 'string'
  )
    return null;
  return {
    decision: wire.decision,
    summary: wire.summary,
    deadline: wire.deadline,
    declared: wire.declared === true,
  };
}

/**
 * `escalation` on no-default inbox cases (#22371): only levels 1 (24h) and
 * 2 (48h) badge on Home. Parsed leniently; anything else means none.
 */
function escalationOf(item: OvieInboxCase): OvieAsk['escalation'] {
  const wire = (
    item as {
      readonly escalation?: {
        readonly level?: unknown;
        readonly waitingHours?: unknown;
      } | null;
    }
  ).escalation;
  if (
    !wire ||
    (wire.level !== 1 && wire.level !== 2) ||
    typeof wire.waitingHours !== 'number' ||
    !Number.isFinite(wire.waitingHours)
  )
    return null;
  return { level: wire.level, waitingHours: Math.floor(wire.waitingHours) };
}

/**
 * Review asks (certify, accept a visual change) may only offer their action
 * with evidence attached. Certification rows carry tier receipts; they become
 * the inline summary even when no receipt has a navigable link.
 */
function reviewEvidence(
  item: OvieInboxCase
): Pick<OvieAsk, 'requiresEvidence' | 'evidenceSummary'> {
  const kind = item.decisionTarget?.kind;
  if (
    item.kind !== 'certification' &&
    kind !== 'certification' &&
    kind !== 'visual'
  )
    return {};
  const receipts = item.certification?.row.evidence ?? [];
  const summary = receipts.length
    ? receipts
        .slice(0, 3)
        .map(
          receipt =>
            `${OVIE_CERTIFICATION_TIER_LABELS[receipt.tier]} ${receipt.status}`
        )
        .join(' · ') +
      (receipts.length > 3 ? ` · +${receipts.length - 3} more` : '')
    : null;
  return { requiresEvidence: true, evidenceSummary: summary };
}

function askFromCase(item: OvieInboxCase): OvieAsk {
  return {
    id: item.id,
    title: item.title,
    recommendation: item.recommendation,
    why: item.body,
    decidable: item.decisionTarget !== null,
    actionLabel: ovieAskAction(item.decisionTarget?.kind).actionLabel,
    ...(item.answers?.length ? { options: item.answers } : {}),
    // Linear replies are posted back to the issue as the answer.
    canReply: item.decisionTarget !== null,
    evidence: item.evidence,
    ...reviewEvidence(item),
    decisionDefault: decisionDefaultOf(item),
    // Summer cards accept post-ship feedback once decided.
    canFeedback: item.decisionTarget?.kind === 'summer',
    escalation: escalationOf(item),
  };
}

/** "Blocked on you": inbox cases that need the founder, in inbox rank order. */
export function buildOvieAsks(inbox: OvieInbox): readonly OvieAsk[] {
  return inbox.cases
    .filter(item => item.state === 'needs_you')
    .map(askFromCase);
}

/** "shipping:pr-open" → "Shipping · PR Open"; unknown shapes pass through. */
export function stageLabel(stage: string): string {
  const words = (part: string) =>
    part
      .split(/[-_]/)
      .filter(Boolean)
      .map(word =>
        /^(pr|ci|mq)$/i.test(word)
          ? word.toUpperCase()
          : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join(' ');
  return stage
    .split(':')
    .map(part => part.split('->').map(words).join(' → '))
    .join(' · ');
}

export interface OvieStageLatency {
  readonly rows: readonly HomeLoopLatencyRow[];
  /** Regressed metrics with no row in the slowest list, labelled. */
  readonly otherRegressions: readonly string[];
  readonly coverage: string | null;
}

/**
 * The slowest 7d p95 stages and current regressions — what Home drives down.
 * Regression keys look like "remediation:classified.p95".
 */
export function buildStageLatency(
  summary: StageSummary | null | undefined,
  maxRows = 5
): OvieStageLatency | null {
  if (!summary) return null;
  const regressed = new Set(
    summary.regressions.map(key => key.replace(/\.p(50|95)$/, ''))
  );
  const rows = summary.slowestP95.slice(0, maxRows).map(row => ({
    id: row.stage,
    label: stageLabel(row.stage),
    p50: formatDurationSeconds(row.p50),
    p95: formatDurationSeconds(row.p95),
    samples: row.n,
    regressed: regressed.has(row.stage),
  }));
  const shown = new Set(rows.map(row => row.id));
  return {
    rows,
    otherRegressions: [...regressed]
      .filter(stage => !shown.has(stage))
      .map(stageLabel),
    coverage:
      summary.stagesWithData !== null && summary.stagesTotal !== null
        ? `${summary.stagesWithData} of ${summary.stagesTotal} stages measured`
        : null,
  };
}
