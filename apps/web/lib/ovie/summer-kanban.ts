/**
 * Summer-owned company Kanban (JOV-5215).
 *
 * Company items (flash/heavy/engineering) share durable work IDs with Eve
 * receipts. Personal and taste never enter this board. Eve cannot rank or
 * dispatch Symphony from here; Summer transitions the same IDs.
 */

import { denyEveAction } from '@/lib/ovie/eve-authority';
import { DEST_KANBAN, type OvieLane } from '@/lib/ovie/ingest';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
import type { OvieInitiative, OvieRoutingState } from '@/lib/ovie/mcp/types';

export const SUMMER_KANBAN_OWNER = 'summer' as const;

export type SummerKanbanLane = Extract<
  OvieLane,
  'flash' | 'heavy' | 'engineering'
>;

export type SummerKanbanCard = {
  readonly workId: string;
  readonly idempotencyKey: string;
  readonly title: string;
  readonly lane: SummerKanbanLane;
  readonly routingState: OvieRoutingState;
  readonly reason?: string;
  readonly owner: typeof SUMMER_KANBAN_OWNER;
};

export function isSummerKanbanLane(lane: OvieLane): lane is SummerKanbanLane {
  return lane === 'flash' || lane === 'heavy' || lane === 'engineering';
}

export function toSummerKanbanCard(
  initiative: OvieInitiative
): SummerKanbanCard | null {
  if (initiative.destination !== DEST_KANBAN) return null;
  if (!isSummerKanbanLane(initiative.lane)) return null;
  return {
    workId: initiative.id,
    idempotencyKey: initiative.idempotencyKey ?? `ovie-${initiative.id}`,
    title: initiative.handoff.title,
    lane: initiative.lane,
    routingState: initiative.routingState ?? 'queued',
    reason: initiative.routingReason,
    owner: SUMMER_KANBAN_OWNER,
  };
}

export async function listSummerKanban(
  store: OperatingStore
): Promise<readonly SummerKanbanCard[]> {
  const rows = await store.listInitiatives();
  return rows.flatMap(row => {
    const card = toSummerKanbanCard(row);
    return card ? [card] : [];
  });
}

export async function inspectSummerCard(
  store: OperatingStore,
  workId: string
): Promise<SummerKanbanCard | undefined> {
  const row = await store.getInitiative(workId);
  if (!row) return undefined;
  return toSummerKanbanCard(row) ?? undefined;
}

export async function transitionSummerCard(
  store: OperatingStore,
  input: {
    readonly workId: string;
    readonly routingState: OvieRoutingState;
    readonly actor: 'summer' | 'eve';
    readonly reason?: string;
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
