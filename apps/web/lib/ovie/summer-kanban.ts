/**
 * Summer-owned company Kanban (JOV-5215, card truth JOV-5761).
 *
 * Operations items (flash/heavy) share durable work IDs with Eve receipts.
 * Engineering ships through Linear; personal and taste remain isolated.
 *
 * Cards expose source-backed truth only: deterministic freshness from the
 * persisted `updatedAt`, blocker facts only when persisted, and terminal
 * `done`/`landed` states only as proven when an exact receipt/evidence ref
 * exists. Missing or stale data is explicit `unknown` / `not-proven` — never
 * healthy, zero, blank, or a new timestamp (see ovie.shipping-state.v1).
 */

import { denyEveAction } from '@/lib/ovie/eve-authority';
import { DEST_KANBAN, type OvieLane } from '@/lib/ovie/ingest';
import { normalizeLegacyEngineeringInitiativeForStore } from '@/lib/ovie/legacy-routing';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
import type {
  InitiativeStatus,
  OvieBlocker,
  OvieInitiative,
  OvieRoutingState,
} from '@/lib/ovie/mcp/types';
import type { ObservationState } from '@/lib/ovie/shipping-state/contract';

export const SUMMER_KANBAN_OWNER = 'summer' as const;

/** Ops cards are human-scale; a day-old source read is stale. */
export const SUMMER_KANBAN_FRESHNESS_MS = 24 * 60 * 60 * 1000;
export const SUMMER_KANBAN_CLOCK_SKEW_MS = 60_000;

export type SummerKanbanLane = Extract<OvieLane, 'flash' | 'heavy'>;

export type SummerKanbanFreshness = Extract<
  ObservationState,
  'fresh' | 'stale' | 'unknown'
>;

export type SummerKanbanAvailability = 'available' | 'unavailable';

export type SummerKanbanBlockerTruth =
  | { readonly state: 'not-blocked' }
  | {
      readonly state: 'blocked';
      readonly summary: string | null;
      readonly owner: string | null;
      readonly nextAction: string | null;
      readonly nextProofDeadline: string | null;
      /** True only when owner, next action, and next-proof deadline are all persisted. */
      readonly complete: boolean;
    };

export type SummerKanbanTerminalTruth =
  | { readonly state: 'not-terminal' }
  | {
      /** `done`/`landed` without an exact receipt/evidence ref is not proven. */
      readonly state: 'proven' | 'not-proven';
      readonly receiptRef: string | null;
      readonly observedAt: string | null;
    };

export type SummerKanbanCard = {
  readonly workId: string;
  readonly idempotencyKey: string;
  readonly title: string;
  readonly lane: SummerKanbanLane;
  readonly routingState: OvieRoutingState;
  readonly reason?: string;
  readonly owner: typeof SUMMER_KANBAN_OWNER;
  readonly status: InitiativeStatus;
  /** Persisted source timestamp. Null when the source has none — never now. */
  readonly sourceUpdatedAt: string | null;
  readonly freshness: SummerKanbanFreshness;
  readonly availability: SummerKanbanAvailability;
  readonly blocker: SummerKanbanBlockerTruth;
  readonly terminal: SummerKanbanTerminalTruth;
};

/** Clock injection keeps freshness deterministic and testable. */
export type SummerKanbanCardOptions = {
  readonly now?: () => number;
};

export function isSummerKanbanLane(lane: OvieLane): lane is SummerKanbanLane {
  return lane === 'flash' || lane === 'heavy';
}

function sourceFreshness(
  updatedAt: string | undefined,
  nowMs: number
): {
  readonly sourceUpdatedAt: string | null;
  readonly freshness: SummerKanbanFreshness;
} {
  const trimmed = typeof updatedAt === 'string' ? updatedAt.trim() : '';
  const parsed = trimmed ? Date.parse(trimmed) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return { sourceUpdatedAt: null, freshness: 'unknown' };
  }
  if (parsed - nowMs > SUMMER_KANBAN_CLOCK_SKEW_MS) {
    // Future-dated beyond skew tolerance: not provably fresh, never rewritten.
    return { sourceUpdatedAt: trimmed, freshness: 'unknown' };
  }
  return {
    sourceUpdatedAt: trimmed,
    freshness: nowMs - parsed <= SUMMER_KANBAN_FRESHNESS_MS ? 'fresh' : 'stale',
  };
}

function blockerTruth(initiative: OvieInitiative): SummerKanbanBlockerTruth {
  if ((initiative.routingState ?? 'queued') !== 'blocked') {
    return { state: 'not-blocked' };
  }
  const blocker = initiative.blocker;
  const summary =
    blocker?.summary?.trim() || initiative.routingReason?.trim() || null;
  const owner = blocker?.owner?.trim() || null;
  const nextAction = blocker?.nextAction?.trim() || null;
  const nextProofDeadline = blocker?.nextProofDeadline?.trim() || null;
  return {
    state: 'blocked',
    summary,
    owner,
    nextAction,
    nextProofDeadline,
    complete: Boolean(owner && nextAction && nextProofDeadline),
  };
}

function terminalReceiptOf(initiative: OvieInitiative): {
  readonly receiptRef: string | null;
  readonly observedAt: string | null;
} {
  const direct = initiative.destinationHandle?.trim();
  if (direct) {
    return { receiptRef: direct, observedAt: landedObservedAt(initiative) };
  }
  for (const receipt of initiative.receipts) {
    const handle = receipt.destinationHandle?.trim();
    if (handle) {
      return { receiptRef: handle, observedAt: landedObservedAt(initiative) };
    }
  }
  for (const ev of initiative.evidence) {
    if (ev.kind !== 'landed') continue;
    const ref = ev.landed_ref?.trim() || ev.ref?.trim();
    if (ref) return { receiptRef: ref, observedAt: ev.observedAt ?? null };
  }
  return { receiptRef: null, observedAt: null };
}

function landedObservedAt(initiative: OvieInitiative): string | null {
  for (const ev of initiative.evidence) {
    if (ev.kind !== 'landed') continue;
    const observed = ev.observedAt?.trim();
    if (observed) return observed;
  }
  return null;
}

function terminalTruth(initiative: OvieInitiative): SummerKanbanTerminalTruth {
  const state = initiative.routingState;
  if (state !== 'done' && state !== 'landed') {
    return { state: 'not-terminal' };
  }
  const { receiptRef, observedAt } = terminalReceiptOf(initiative);
  if (!receiptRef) {
    return { state: 'not-proven', receiptRef: null, observedAt: null };
  }
  return { state: 'proven', receiptRef, observedAt };
}

function availabilityOf(initiative: OvieInitiative): SummerKanbanAvailability {
  // Provider/runtime failure must never render as ordinary queued work.
  return initiative.routingState === 'unavailable' ||
    initiative.status === 'failed'
    ? 'unavailable'
    : 'available';
}

export function toSummerKanbanCard(
  initiative: OvieInitiative,
  options?: SummerKanbanCardOptions
): SummerKanbanCard | null {
  if (initiative.destination !== DEST_KANBAN) return null;
  if (!isSummerKanbanLane(initiative.lane)) return null;
  const nowMs = options?.now?.() ?? Date.now();
  const { sourceUpdatedAt, freshness } = sourceFreshness(
    initiative.updatedAt,
    nowMs
  );
  return {
    workId: initiative.id,
    idempotencyKey: initiative.idempotencyKey ?? `ovie-${initiative.id}`,
    title: initiative.handoff.title,
    lane: initiative.lane,
    routingState: initiative.routingState ?? 'queued',
    reason: initiative.routingReason,
    owner: SUMMER_KANBAN_OWNER,
    status: initiative.status,
    sourceUpdatedAt,
    freshness,
    availability: availabilityOf(initiative),
    blocker: blockerTruth(initiative),
    terminal: terminalTruth(initiative),
  };
}

export async function listSummerKanban(
  store: OperatingStore,
  options?: SummerKanbanCardOptions
): Promise<readonly SummerKanbanCard[]> {
  const rows = await store.listInitiatives();
  const normalized = await Promise.all(
    rows.map(row =>
      normalizeLegacyEngineeringInitiativeForStore(store, row, {
        persistence: 'best-effort',
      })
    )
  );
  return normalized.flatMap(row => {
    const card = toSummerKanbanCard(row, options);
    return card ? [card] : [];
  });
}

export async function inspectSummerCard(
  store: OperatingStore,
  workId: string,
  options?: SummerKanbanCardOptions
): Promise<SummerKanbanCard | undefined> {
  const row = await store.getInitiative(workId);
  if (!row) return undefined;
  const normalized = await normalizeLegacyEngineeringInitiativeForStore(
    store,
    row,
    { persistence: 'best-effort' }
  );
  return toSummerKanbanCard(normalized, options) ?? undefined;
}

export async function transitionSummerCard(
  store: OperatingStore,
  input: {
    readonly workId: string;
    readonly routingState: OvieRoutingState;
    readonly actor: 'summer' | 'eve';
    readonly reason?: string;
    /** Persisted blocker facts; meaningful only with routingState 'blocked'. */
    readonly blocker?: OvieBlocker;
  }
): Promise<OvieInitiative> {
  if (input.actor !== 'summer') {
    denyEveAction('choose-priority');
  }
  const current = await store.getInitiative(input.workId);
  if (!current) {
    throw new Error(`unknown summer card ${input.workId}`);
  }
  const card = toSummerKanbanCard(current);
  if (!card) {
    throw new Error(`not a company kanban item ${input.workId}`);
  }
  const now = new Date().toISOString();
  const next: OvieInitiative = {
    ...current,
    updatedAt: now,
    routingState: input.routingState,
    routingReason: input.reason ?? current.routingReason,
    blocker:
      input.routingState === 'blocked'
        ? (input.blocker ?? current.blocker)
        : undefined,
    status:
      input.routingState === 'blocked'
        ? 'blocked'
        : input.routingState === 'unavailable'
          ? 'failed'
          : input.routingState === 'done' || input.routingState === 'landed'
            ? 'implemented'
            : input.routingState === 'in_progress'
              ? 'executing'
              : 'accepted',
  };
  await store.putInitiative(next);
  return next;
}
