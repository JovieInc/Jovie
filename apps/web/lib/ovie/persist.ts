/**
 * Durable Ovie dump persist + Mac lander pending/landed helpers.
 *
 * Chat/MCP share OperatingStore. Dump never spawns a worker.
 * Mac lander: GET /api/ovie/pending then POST /api/ovie/landed.
 * Destination writer is ovie-intake-to-kanban.py.
 * Kanban idempotency_key is ovie-<initiative_id>; created-by ovie.
 */

import {
  DEST_LINEAR,
  ingestOvieDump,
  type OvieReceipt,
  ovieAckForHandle,
  persistOvieReceipt,
  routeEngineeringToLinear,
  type SpawnFn,
} from '@/lib/ovie/ingest';
import { newRecordId, type OperatingStore } from '@/lib/ovie/mcp/store';
import type { OvieInitiative } from '@/lib/ovie/mcp/types';

export const OVIE_CREATED_BY = 'ovie' as const;

export function ovieIdempotencyKey(initiativeId: string): string {
  return `ovie-${initiativeId}`;
}

export type OvieDumpOptions = {
  readonly spawn?: SpawnFn;
  readonly store: OperatingStore;
};

export function destinationHandleOf(initiative: OvieInitiative): string | null {
  const direct = initiative.destinationHandle?.trim();
  if (direct) return direct;
  for (const receipt of initiative.receipts) {
    const handle = receipt.destinationHandle?.trim();
    if (handle) return handle;
  }
  for (const ev of initiative.evidence) {
    const landed = ev.landed_ref?.trim();
    if (landed) return landed;
    if (ev.summary.startsWith('landed:')) {
      const rest = ev.summary.slice('landed:'.length).trim();
      if (rest) return rest;
    }
  }
  return null;
}

export function isInitiativeLanded(initiative: OvieInitiative): boolean {
  return destinationHandleOf(initiative) !== null;
}

export function initiativeAckView(initiative: OvieInitiative) {
  const destinationHandle = destinationHandleOf(initiative);
  return {
    ...initiative,
    destinationHandle,
    ack: ovieAckForHandle(destinationHandle),
    complete: Boolean(destinationHandle),
    workerSpawned: false as const,
    queuedFor: destinationHandle ? undefined : ('summer-lander' as const),
  };
}

export function receiptToInitiative(receipt: OvieReceipt): OvieInitiative {
  const now = new Date().toISOString();
  return {
    id: newRecordId('ini'),
    kind: 'initiative',
    status: 'accepted',
    handoff: {
      title: receipt.text.slice(0, 120) || receipt.ack,
      intent: receipt.text,
      provenance: 'ovie-dump',
    },
    lane: receipt.lane,
    destination: receipt.destination,
    receipts: [receipt],
    workerSpawned: false,
    destinationHandle: null,
    createdAt: now,
    updatedAt: now,
    evidence: [
      {
        kind: 'receipt',
        summary: receipt.ack,
        ref: receipt.destination,
      },
    ],
  };
}

export async function persistReceiptAsInitiative(
  store: OperatingStore,
  receipt: OvieReceipt
): Promise<OvieInitiative> {
  const record = receiptToInitiative(receipt);
  await store.putInitiative(record);
  return record;
}

/**
 * Classify, persist one initiative per item on the durable store, and
 * route engineering to Linear. Spawn is accepted and ignored.
 */
export async function applyOvieDump(
  items: readonly string[],
  options: OvieDumpOptions
): Promise<OvieReceipt[]> {
  void options.spawn;
  const receipts = ingestOvieDump(items, options);
  for (const receipt of receipts) {
    persistOvieReceipt(receipt);
    if (receipt.destination === DEST_LINEAR) {
      routeEngineeringToLinear(receipt);
    }
    await persistReceiptAsInitiative(options.store, receipt);
  }
  return receipts;
}

/** Chat-route entry: ack + durable persist + Linear-route before executeChatTurn. */
export async function applyOvieDumpBeforeModel(
  userText: string | null,
  options: OvieDumpOptions
): Promise<OvieReceipt[]> {
  if (!userText || userText.trim() === '') return [];
  return applyOvieDump([userText], options);
}

export async function listPendingInitiatives(
  store: OperatingStore
): Promise<readonly OvieInitiative[]> {
  const rows = await store.listInitiatives();
  return rows.filter(row => !isInitiativeLanded(row));
}

export type LandInitiativeInput = {
  readonly id: string;
  readonly landed_ref?: string;
  readonly task_id?: string;
  readonly linear_id?: string;
};

export function resolveLandedHandle(input: LandInitiativeInput): string {
  return (
    input.linear_id?.trim() ||
    input.task_id?.trim() ||
    input.landed_ref?.trim() ||
    ''
  );
}

export async function markInitiativeLanded(
  store: OperatingStore,
  input: LandInitiativeInput
): Promise<OvieInitiative | undefined> {
  const landedRef = resolveLandedHandle(input);
  if (!landedRef) throw new Error('landed_ref is required');
  const current = await store.getInitiative(input.id);
  if (!current) return undefined;
  if (isInitiativeLanded(current)) return current;
  const now = new Date().toISOString();
  const ack = ovieAckForHandle(landedRef);
  const next: OvieInitiative = {
    ...current,
    updatedAt: now,
    destinationHandle: landedRef,
    receipts: current.receipts.map(receipt => ({
      ...receipt,
      destinationHandle: landedRef,
      ack,
      workerSpawned: false,
    })),
    evidence: [
      ...current.evidence,
      {
        kind: 'landed',
        summary: ack,
        ref: landedRef,
        landed_ref: landedRef,
      },
    ],
  };
  await store.putInitiative(next);
  return next;
}

export type PendingInitiativeView = OvieInitiative & {
  readonly idempotency_key: string;
  readonly created_by: typeof OVIE_CREATED_BY;
  readonly landed: false;
  readonly ack: string;
  readonly destinationHandle: null;
};

export function toPendingInitiativeView(
  initiative: OvieInitiative
): PendingInitiativeView {
  return {
    ...initiative,
    idempotency_key: ovieIdempotencyKey(initiative.id),
    created_by: OVIE_CREATED_BY,
    landed: false,
    ack: ovieAckForHandle(null),
    destinationHandle: null,
  };
}
