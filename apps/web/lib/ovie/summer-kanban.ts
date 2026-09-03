/**
 * Summer-owned company Kanban (JOV-5215, card truth JOV-5761).
 *
 * Operations items (flash/heavy) share durable work IDs with Eve receipts.
 * Engineering ships through Linear; personal and taste remain isolated.
 *
 * JOV-5761 projection fields: per-source freshness reuses the
 * ovie.shipping-state.v1 observation vocabulary, the accountable next
 * action / next proof derive from the routing state, blocker facts are
 * exposed only when actually persisted, and terminal `done`/`landed` cards
 * are proven only when an exact receipt/evidence reference exists.
 * Everything is derived at read time — nothing here is stored — and
 * missing or stale source data is explicit `unknown` / `not-proven`,
 * never fresh, healthy, zero, blank, or a new timestamp.
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
import {
  freshnessDeadline,
  type ObservationState,
  observationFreshness,
  parseTimestamp,
} from '@/lib/ovie/shipping-state';

export const SUMMER_KANBAN_OWNER = 'summer' as const;

export type SummerKanbanLane = Extract<OvieLane, 'flash' | 'heavy'>;

/**
 * The durable initiative record is a persisted source, not a heartbeat, so
 * it rides the same ten-minute semantic window as the persisted producers
 * in SHIPPING_SOURCE_SEMANTIC_FRESHNESS_MS (fleet-receipt, lease-guard).
 */
export const SUMMER_KANBAN_FRESHNESS_MS = 10 * 60_000;

/** Future-dated source writes beyond this skew are not provably fresh. */
export const SUMMER_KANBAN_CLOCK_SKEW_MS = 60_000;

export const SUMMER_KANBAN_FRESHNESS_SOURCES = ['initiative-record'] as const;

export type SummerKanbanFreshnessSource =
  (typeof SUMMER_KANBAN_FRESHNESS_SOURCES)[number];

export type SummerKanbanFreshnessState = Extract<
  ObservationState,
  'fresh' | 'stale' | 'unknown'
>;

export type SummerKanbanSourceFreshness = {
  readonly source: SummerKanbanFreshnessSource;
  readonly state: SummerKanbanFreshnessState;
  /** Last authoritative write on the underlying record; null when missing. */
  readonly observedAt: string | null;
  /** observedAt + SUMMER_KANBAN_FRESHNESS_MS; null while unobserved. */
  readonly freshnessDeadline: string | null;
};

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

export type SummerKanbanTerminalEvidence = {
  /** `done`/`landed` without an exact receipt/evidence ref is not proven. */
  readonly state: 'proven' | 'not-proven';
  /** Existing receipt/evidence reference; null when none was recorded. */
  readonly ref: string | null;
  /** The same reference when it is already a URL (for example Linear). */
  readonly url: string | null;
  /** Existing evidence summary line for the reference. */
  readonly summary: string | null;
  /** Observation time of the terminal evidence; null when unrecorded. */
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
  /** Read-only per-source freshness in the ovie.shipping-state.v1 vocabulary. */
  readonly freshness: readonly SummerKanbanSourceFreshness[];
  /** Provider/runtime failure must never render as ordinary queued work. */
  readonly availability: SummerKanbanAvailability;
  /** Persisted blocker facts; missing fields stay null, never invented. */
  readonly blocker: SummerKanbanBlockerTruth;
  /** Accountable next action for Summer; null once the card is terminal. */
  readonly nextAction: string | null;
  /** Proof that closes the loop on the next action; null once terminal. */
  readonly nextProof: string | null;
  /** Terminal evidence reference; null until the card reaches a terminal state. */
  readonly terminalEvidence: SummerKanbanTerminalEvidence | null;
};

export function isSummerKanbanLane(lane: OvieLane): lane is SummerKanbanLane {
  return lane === 'flash' || lane === 'heavy';
}

const TERMINAL_ROUTING_STATES: ReadonlySet<OvieRoutingState> = new Set([
  'landed',
  'done',
]);

const UNKNOWN_INITIATIVE_FRESHNESS: SummerKanbanSourceFreshness = {
  source: 'initiative-record',
  state: 'unknown',
  observedAt: null,
  freshnessDeadline: null,
};

function initiativeRecordFreshness(
  initiative: OvieInitiative,
  now: string
): SummerKanbanSourceFreshness {
  const observedAt = parseTimestamp(initiative.updatedAt);
  const nowParsed = parseTimestamp(now);
  if (!observedAt || !nowParsed) return UNKNOWN_INITIATIVE_FRESHNESS;
  if (
    Date.parse(observedAt) - Date.parse(nowParsed) >
    SUMMER_KANBAN_CLOCK_SKEW_MS
  ) {
    // Future-dated beyond skew tolerance: not provably fresh, never rewritten.
    return {
      source: 'initiative-record',
      state: 'unknown',
      observedAt,
      freshnessDeadline: null,
    };
  }
  const deadline = freshnessDeadline(observedAt, SUMMER_KANBAN_FRESHNESS_MS);
  return {
    source: 'initiative-record',
    state:
      observationFreshness(observedAt, deadline, now, 'fresh') === 'stale'
        ? 'stale'
        : 'fresh',
    observedAt,
    freshnessDeadline: deadline,
  };
}

const NEXT_STEP_BY_ROUTING_STATE: Readonly<
  Record<
    OvieRoutingState,
    { readonly action: string | null; readonly proof: string | null }
  >
> = {
  queued: {
    action: 'Summer triage: accept, start, or block with a reason',
    proof: 'accepted, in_progress, or blocked routing receipt',
  },
  accepted: {
    action: 'Summer starts the accepted work',
    proof: 'in_progress routing receipt',
  },
  in_progress: {
    action: 'Summer drives the work to a terminal state',
    proof: 'landed or done receipt carrying a terminal evidence reference',
  },
  blocked: {
    action: 'Summer clears the blocker named in the reason',
    proof: 'routing receipt out of blocked with the resolution reason',
  },
  unavailable: {
    action: 'Summer restores the failed route and requeues the work',
    proof: 'queued routing receipt after the route recovers',
  },
  landed: { action: null, proof: null },
  done: { action: null, proof: null },
};

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

function availabilityOf(initiative: OvieInitiative): SummerKanbanAvailability {
  // Provider/runtime failure must never render as ordinary queued work.
  return initiative.routingState === 'unavailable' ||
    initiative.status === 'failed'
    ? 'unavailable'
    : 'available';
}

function terminalEvidenceOf(
  initiative: OvieInitiative,
  routingState: OvieRoutingState
): SummerKanbanTerminalEvidence | null {
  if (!TERMINAL_ROUTING_STATES.has(routingState)) return null;
  const evidence = [...initiative.evidence].reverse();
  const receiptHandle = initiative.receipts
    .map(receipt => receipt.destinationHandle?.trim())
    .find(handle => handle);
  // Only landing artifacts count: a receipt-kind ref is the destination
  // name, not terminal evidence.
  const ref =
    evidence.find(entry => entry.landed_ref?.trim())?.landed_ref?.trim() ||
    initiative.destinationHandle?.trim() ||
    receiptHandle ||
    evidence
      .find(entry => entry.kind === 'landed' && entry.ref?.trim())
      ?.ref?.trim() ||
    null;
  const matching = ref
    ? evidence.find(
        entry => entry.landed_ref?.trim() === ref || entry.ref?.trim() === ref
      )
    : undefined;
  return {
    state: ref ? 'proven' : 'not-proven',
    ref,
    url: ref && /^https:\/\/\S+$/.test(ref) ? ref : null,
    summary: matching?.summary ?? null,
    observedAt: matching?.observedAt?.trim() || null,
  };
}

export function toSummerKanbanCard(
  initiative: OvieInitiative,
  now: string = new Date().toISOString()
): SummerKanbanCard | null {
  if (initiative.destination !== DEST_KANBAN) return null;
  if (!isSummerKanbanLane(initiative.lane)) return null;
  const routingState = initiative.routingState ?? 'queued';
  const nextStep = NEXT_STEP_BY_ROUTING_STATE[routingState];
  return {
    workId: initiative.id,
    idempotencyKey: initiative.idempotencyKey ?? `ovie-${initiative.id}`,
    title: initiative.handoff.title,
    lane: initiative.lane,
    routingState,
    reason: initiative.routingReason,
    owner: SUMMER_KANBAN_OWNER,
    status: initiative.status,
    freshness: [initiativeRecordFreshness(initiative, now)],
    availability: availabilityOf(initiative),
    blocker: blockerTruth(initiative),
    nextAction: nextStep.action,
    nextProof: nextStep.proof,
    terminalEvidence: terminalEvidenceOf(initiative, routingState),
  };
}

export async function listSummerKanban(
  store: OperatingStore,
  now?: string
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
    const card = toSummerKanbanCard(row, now);
    return card ? [card] : [];
  });
}

export async function inspectSummerCard(
  store: OperatingStore,
  workId: string,
  now?: string
): Promise<SummerKanbanCard | undefined> {
  const row = await store.getInitiative(workId);
  if (!row) return undefined;
  const normalized = await normalizeLegacyEngineeringInitiativeForStore(
    store,
    row,
    { persistence: 'best-effort' }
  );
  return toSummerKanbanCard(normalized, now) ?? undefined;
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
