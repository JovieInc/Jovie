/**
 * Durable Ovie dump persist + Mac lander pending/landed helpers (JOV-5215).
 *
 * Persist the receipt first, then ack. Chat/MCP share OperatingStore.
 * Dump never spawns a worker. Operations items go to Summer's Kanban;
 * engineering is queued for Summer's Linear intake. Eve does not create
 * Linear work or dispatch Symphony.
 * Mac lander: GET /api/ovie/pending then POST /api/ovie/landed.
 * Destination writer is ovie-intake-to-kanban.py.
 * Kanban idempotency_key is ovie-<initiative_id>; created-by ovie.
 */

import { createHash } from 'node:crypto';
import {
  classifyOvieItem,
  DEST_KANBAN,
  DEST_LINEAR,
  destinationForOvieLane,
  getOvieIntakeMode,
  OVIE_BLOCKED_ACK,
  OVIE_UNAVAILABLE_ACK,
  type OvieReceipt,
  ovieAckForHandle,
  persistOvieReceipt,
  queuedAckForDestination,
  recordOvieAckLatency,
  type SpawnFn,
} from '@/lib/ovie/ingest';
import { normalizeLegacyEngineeringInitiativeForStore } from '@/lib/ovie/legacy-routing';
import { newRecordId, type OperatingStore } from '@/lib/ovie/mcp/store';
import type { OvieInitiative, OvieRoutingState } from '@/lib/ovie/mcp/types';
import { isSummerKanbanLane } from '@/lib/ovie/summer-kanban';

export const OVIE_CREATED_BY = 'ovie' as const;

export function ovieIdempotencyKey(initiativeId: string): string {
  return `ovie-${initiativeId}`;
}

export function defaultOvieDumpKey(text: string): string {
  return `ovie-dump:v1:${text.trim()}`;
}

export function ovieWorkIdFromKey(idempotencyKey: string): string {
  const digest = createHash('sha256')
    .update(idempotencyKey)
    .digest('base64url')
    .slice(0, 16);
  return `ini_${digest}`;
}

export type OvieDumpOptions = {
  readonly spawn?: SpawnFn;
  readonly store: OperatingStore;
  readonly idempotencyKeys?: readonly string[];
  readonly mode?: 'normal' | 'receipt-only';
  readonly afterPersist?: (record: OvieInitiative) => Promise<void> | void;
  readonly routeCompany?: (record: OvieInitiative) => Promise<void> | void;
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
  return (
    destinationHandleOf(initiative) !== null ||
    initiative.routingState === 'landed'
  );
}

export function initiativeAckView(initiative: OvieInitiative) {
  const destinationHandle = destinationHandleOf(initiative);
  let queuedFor: 'summer-linear-intake' | 'summer-lander' | undefined;
  if (!destinationHandle) {
    queuedFor =
      initiative.destination === 'linear'
        ? 'summer-linear-intake'
        : 'summer-lander';
  }
  return {
    ...initiative,
    destinationHandle,
    ack: ackForInitiative(initiative, destinationHandle),
    complete: Boolean(destinationHandle),
    workerSpawned: false as const,
    queuedFor,
  };
}

function ackForRoutingState(
  state: OvieRoutingState | undefined,
  destinationHandle: string | null,
  destination: OvieInitiative['destination']
): string {
  if (destinationHandle) return ovieAckForHandle(destinationHandle);
  if (state === 'unavailable') return OVIE_UNAVAILABLE_ACK;
  if (state === 'blocked') return OVIE_BLOCKED_ACK;
  return queuedAckForDestination(destination);
}

function ackForInitiative(
  initiative: OvieInitiative,
  destinationHandle: string | null = destinationHandleOf(initiative)
): string {
  return ackForRoutingState(
    initiative.routingState,
    destinationHandle,
    initiative.destination
  );
}

function initialAckForRoutingState(
  destination: OvieInitiative['destination'],
  routingState: OvieRoutingState
): string {
  if (routingState === 'unavailable') return OVIE_UNAVAILABLE_ACK;
  return queuedAckForDestination(destination);
}

export function receiptToInitiative(
  receipt: OvieReceipt,
  options?: {
    readonly id?: string;
    readonly idempotencyKey?: string;
    readonly routingState?: OvieRoutingState;
    readonly routingReason?: string;
  }
): OvieInitiative {
  const now = new Date().toISOString();
  const id = options?.id ?? receipt.workId ?? newRecordId('ini');
  const routingState =
    options?.routingState ?? receipt.routingState ?? 'queued';
  return {
    id,
    kind: 'initiative',
    status: routingState === 'unavailable' ? 'failed' : 'accepted',
    confidence: 'medium',
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
    idempotencyKey: options?.idempotencyKey ?? receipt.idempotencyKey,
    routingState,
    routingReason: options?.routingReason,
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

export function receiptFromInitiative(
  initiative: OvieInitiative,
  persistToAckMs?: number
): OvieReceipt {
  const destinationHandle = destinationHandleOf(initiative);
  return {
    text: initiative.handoff.intent,
    lane: initiative.lane,
    destination: initiative.destination,
    ack: ackForInitiative(initiative, destinationHandle),
    destinationHandle,
    workerSpawned: false,
    workId: initiative.id,
    idempotencyKey:
      initiative.idempotencyKey ?? ovieIdempotencyKey(initiative.id),
    persistToAckMs,
    routingState: initiative.routingState ?? 'queued',
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

export async function inspectOvieIntake(
  store: OperatingStore,
  idempotencyKey: string
): Promise<OvieReceipt | undefined> {
  const workId = ovieWorkIdFromKey(idempotencyKey);
  const existing = await store.getInitiative(workId);
  const normalized = existing
    ? await normalizeLegacyEngineeringInitiativeForStore(store, existing, {
        persistence: 'best-effort',
      })
    : undefined;
  return normalized ? receiptFromInitiative(normalized) : undefined;
}

async function restoreQueued(
  store: OperatingStore,
  record: OvieInitiative
): Promise<OvieInitiative> {
  const next: OvieInitiative = {
    ...record,
    updatedAt: new Date().toISOString(),
    status: 'accepted',
    routingState: 'queued',
    routingReason: undefined,
    receipts: record.receipts.map(receipt => ({
      ...receipt,
      ack: queuedAckForDestination(record.destination),
      routingState: 'queued',
    })),
    evidence: [
      {
        kind: 'receipt',
        summary: queuedAckForDestination(record.destination),
        ref: record.destination,
      },
    ],
  };
  await store.putInitiative(next);
  return next;
}

async function finishCompanyRoute(
  store: OperatingStore,
  record: OvieInitiative,
  routeCompany: OvieDumpOptions['routeCompany']
): Promise<OvieInitiative> {
  if (record.destination !== DEST_KANBAN || !isSummerKanbanLane(record.lane)) {
    if (
      record.routingState === 'unavailable' &&
      record.routingReason === 'receipt-only fail-closed'
    ) {
      return restoreQueued(store, record);
    }
    return record;
  }
  try {
    await routeCompany?.(record);
    if (
      record.routingState === 'unavailable' ||
      record.routingState === 'blocked'
    ) {
      return restoreQueued(store, record);
    }
    return record;
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'downstream_unavailable';
    const failedAck = OVIE_UNAVAILABLE_ACK;
    const next: OvieInitiative = {
      ...record,
      updatedAt: new Date().toISOString(),
      status: 'failed',
      routingState: 'unavailable',
      routingReason: reason,
      receipts: record.receipts.map(receipt => ({
        ...receipt,
        ack: failedAck,
        routingState: 'unavailable',
      })),
      evidence: [
        {
          kind: 'receipt',
          summary: failedAck,
          ref: record.destination,
        },
      ],
    };
    await store.putInitiative(next);
    return next;
  }
}

/**
 * Classify, persist one initiative per item, then ack. Spawn is ignored.
 * Operations items are visible on Summer's Kanban via the same work IDs;
 * engineering remains a durable receipt for Summer's Linear intake.
 */
export async function applyOvieDump(
  items: readonly string[],
  options: OvieDumpOptions
): Promise<OvieReceipt[]> {
  void options.spawn;
  const mode = options.mode ?? getOvieIntakeMode();
  const receipts: OvieReceipt[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const text = items[index] ?? '';
    const started = performance.now();
    const key = options.idempotencyKeys?.[index] ?? defaultOvieDumpKey(text);
    const workId = ovieWorkIdFromKey(key);
    const storedExisting = await options.store.getInitiative(workId);
    const existing = storedExisting
      ? await normalizeLegacyEngineeringInitiativeForStore(
          options.store,
          storedExisting,
          { persistence: 'best-effort' }
        )
      : undefined;
    if (existing) {
      const recovered =
        mode === 'receipt-only'
          ? await markUnavailable(
              options.store,
              existing,
              'receipt-only fail-closed'
            )
          : await finishCompanyRoute(
              options.store,
              existing,
              options.routeCompany
            );
      const persistToAckMs = performance.now() - started;
      const receipt = receiptFromInitiative(recovered, persistToAckMs);
      persistOvieReceipt(receipt);
      recordOvieAckLatency(persistToAckMs);
      receipts.push(receipt);
      continue;
    }

    const lane = classifyOvieItem(text);
    const destination = destinationForOvieLane(lane);
    const routingState: OvieRoutingState =
      mode === 'receipt-only' ? 'unavailable' : 'queued';
    const routingReason =
      mode === 'receipt-only' ? 'receipt-only fail-closed' : undefined;
    const ack = initialAckForRoutingState(destination, routingState);
    const classified: OvieReceipt = {
      text,
      lane,
      destination,
      ack,
      destinationHandle: null,
      workerSpawned: false,
      workId,
      idempotencyKey: key,
      routingState,
    };
    const record = receiptToInitiative(classified, {
      id: workId,
      idempotencyKey: key,
      routingState,
      routingReason,
    });
    await options.store.putInitiative(record);
    await options.afterPersist?.(record);

    const routed =
      mode === 'receipt-only'
        ? record
        : await finishCompanyRoute(options.store, record, options.routeCompany);
    const persistToAckMs = performance.now() - started;
    const receipt = receiptFromInitiative(routed, persistToAckMs);
    persistOvieReceipt(receipt);
    recordOvieAckLatency(persistToAckMs);
    receipts.push(receipt);
  }
  return receipts;
}

async function markUnavailable(
  store: OperatingStore,
  record: OvieInitiative,
  reason: string
): Promise<OvieInitiative> {
  if (
    record.routingState === 'unavailable' &&
    record.routingReason === reason
  ) {
    return record;
  }
  const next: OvieInitiative = {
    ...record,
    updatedAt: new Date().toISOString(),
    status: 'failed',
    routingState: 'unavailable',
    routingReason: reason,
    receipts: record.receipts.map(receipt => ({
      ...receipt,
      ack: OVIE_UNAVAILABLE_ACK,
      routingState: 'unavailable',
    })),
    evidence: [
      {
        kind: 'receipt',
        summary: OVIE_UNAVAILABLE_ACK,
        ref: record.destination,
      },
    ],
  };
  await store.putInitiative(next);
  return next;
}

/** Chat-route entry: persist then ack before executeChatTurn. */
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
  const normalized = await Promise.all(
    rows.map(row =>
      normalizeLegacyEngineeringInitiativeForStore(store, row, {
        persistence: 'best-effort',
      })
    )
  );
  return normalized.filter(row => !isInitiativeLanded(row));
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

function isLinearLandedReference(value: string): boolean {
  return (
    /^JOV-\d+$/i.test(value) ||
    /^https:\/\/linear\.app\/jovie\/issue\/JOV-\d+(?:\b|\/)/i.test(value)
  );
}

function resolveLandedHandleForInitiative(
  initiative: OvieInitiative,
  input: LandInitiativeInput
): string {
  if (initiative.destination !== DEST_LINEAR) return resolveLandedHandle(input);
  const linearId = input.linear_id?.trim();
  if (linearId) return linearId;
  const landedRef = input.landed_ref?.trim() ?? '';
  return isLinearLandedReference(landedRef) ? landedRef : '';
}

export async function markInitiativeLanded(
  store: OperatingStore,
  input: LandInitiativeInput
): Promise<OvieInitiative | undefined> {
  const submittedRef = resolveLandedHandle(input);
  if (!submittedRef) throw new Error('landed_ref is required');
  const storedCurrent = await store.getInitiative(input.id);
  if (!storedCurrent) return undefined;
  const current = await normalizeLegacyEngineeringInitiativeForStore(
    store,
    storedCurrent,
    { persistence: 'best-effort' }
  );
  const landedRef = resolveLandedHandleForInitiative(current, input);
  if (!landedRef) throw new Error('linear_id is required');
  if (isInitiativeLanded(current)) return current;
  const now = new Date().toISOString();
  const ack = ovieAckForHandle(landedRef);
  const next: OvieInitiative = {
    ...current,
    updatedAt: now,
    destinationHandle: landedRef,
    routingState: 'landed',
    receipts: current.receipts.map(receipt => ({
      ...receipt,
      destinationHandle: landedRef,
      ack,
      workerSpawned: false,
      routingState: 'landed',
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
    ack: ackForInitiative(initiative, null),
    destinationHandle: null,
  };
}
