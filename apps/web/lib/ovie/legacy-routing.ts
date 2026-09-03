import {
  DEST_KANBAN,
  DEST_LINEAR,
  OVIE_BLOCKED_ACK,
  OVIE_UNAVAILABLE_ACK,
  type OvieReceipt,
  queuedAckForDestination,
} from '@/lib/ovie/ingest';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
import type {
  InitiativeStatus,
  OvieEvidence,
  OvieInitiative,
  OvieRoutingState,
} from '@/lib/ovie/mcp/types';

function firstReceiptRoutingState(
  initiative: OvieInitiative
): OvieRoutingState | undefined {
  return initiative.receipts.find(receipt => receipt.routingState)
    ?.routingState;
}

function legacyRoutingStateOf(initiative: OvieInitiative): OvieRoutingState {
  return (
    initiative.routingState ?? firstReceiptRoutingState(initiative) ?? 'queued'
  );
}

function explicitLegacyRoutingStateOf(
  initiative: OvieInitiative
): OvieRoutingState | undefined {
  return initiative.routingState ?? firstReceiptRoutingState(initiative);
}

function routingStateForLegacyLinear(
  state: OvieRoutingState
): OvieRoutingState {
  if (state === 'landed' || state === 'done') {
    return 'queued';
  }
  return state;
}

function statusForRoutingState(state: OvieRoutingState): InitiativeStatus {
  if (state === 'blocked') return 'blocked';
  if (state === 'unavailable') return 'failed';
  if (state === 'in_progress') return 'executing';
  if (state === 'done' || state === 'landed') return 'implemented';
  return 'accepted';
}

function normalizedStatusForLegacyEngineering(
  initiative: OvieInitiative,
  routingState: OvieRoutingState,
  hasExplicitRoutingState: boolean,
  hasLegacyKanbanHandle: boolean
): InitiativeStatus {
  const routingStatus = statusForRoutingState(routingState);
  if (
    initiative.status === 'proposed' &&
    routingStatus === 'accepted' &&
    !hasLegacyKanbanHandle
  ) {
    return initiative.status;
  }
  if (!hasExplicitRoutingState && !hasLegacyKanbanHandle) {
    return initiative.status;
  }
  return routingStatus;
}

function destinationHandleOf(initiative: OvieInitiative): string | null {
  const direct = initiative.destinationHandle?.trim();
  if (direct) return direct;
  for (const receipt of initiative.receipts) {
    const handle = receipt.destinationHandle?.trim();
    if (handle) return handle;
  }
  for (const evidence of initiative.evidence) {
    const landed = evidence.landed_ref?.trim();
    if (landed) return landed;
    if (evidence.summary.startsWith('landed:')) {
      const rest = evidence.summary.slice('landed:'.length).trim();
      if (rest) return rest;
    }
  }
  return null;
}

function ackForState(state: OvieRoutingState | undefined): string {
  if (state === 'unavailable') return OVIE_UNAVAILABLE_ACK;
  if (state === 'blocked') return OVIE_BLOCKED_ACK;
  return queuedAckForDestination(DEST_LINEAR);
}

function normalizeLegacyReceipt(
  receipt: OvieReceipt,
  routingState: OvieRoutingState
): OvieReceipt {
  return {
    ...receipt,
    lane: 'engineering',
    destination: DEST_LINEAR,
    ack: ackForState(routingState),
    destinationHandle: null,
    routingState,
  };
}

function legacyLandedHandleOf(evidence: OvieEvidence): string | null {
  const landed = evidence.landed_ref?.trim();
  if (landed) return landed;
  if (!evidence.summary.startsWith('landed:')) return null;
  const rest = evidence.summary.slice('landed:'.length).trim();
  return rest || null;
}

function archivedKanbanEvidence(handle: string): OvieEvidence {
  return {
    kind: 'destination',
    summary: `legacy kanban handle archived before Linear intake: ${handle}`,
    ref: DEST_KANBAN,
  };
}

function normalizeLegacyEvidence(
  evidence: readonly OvieEvidence[],
  state: OvieRoutingState,
  legacyKanbanHandle: string | null
): readonly OvieEvidence[] {
  const ack = ackForState(state);
  let archivedHandle = false;
  const next = evidence.map(item => {
    const landedHandle = legacyLandedHandleOf(item);
    if (landedHandle) {
      archivedHandle = true;
      return archivedKanbanEvidence(landedHandle);
    }
    if (item.kind !== 'receipt' || item.ref !== DEST_KANBAN) {
      return item;
    }
    return {
      ...item,
      ref: DEST_LINEAR,
      summary: ack,
    };
  });
  if (legacyKanbanHandle && !archivedHandle) {
    return [...next, archivedKanbanEvidence(legacyKanbanHandle)];
  }
  return next;
}

export function normalizeLegacyEngineeringInitiative(
  initiative: OvieInitiative
): OvieInitiative {
  if (
    initiative.lane !== 'engineering' ||
    initiative.destination !== DEST_KANBAN
  ) {
    return initiative;
  }
  const legacyKanbanHandle = destinationHandleOf(initiative);
  const explicitRoutingState = explicitLegacyRoutingStateOf(initiative);
  const sourceRoutingState = legacyRoutingStateOf(initiative);
  const routingState = routingStateForLegacyLinear(sourceRoutingState);
  const requeuedLegacyLanding =
    sourceRoutingState === 'landed' ||
    sourceRoutingState === 'done' ||
    legacyKanbanHandle !== null;
  return {
    ...initiative,
    status: normalizedStatusForLegacyEngineering(
      initiative,
      routingState,
      explicitRoutingState !== undefined,
      legacyKanbanHandle !== null
    ),
    destination: DEST_LINEAR,
    destinationHandle: null,
    routingState,
    routingReason: requeuedLegacyLanding
      ? 'legacy kanban handle archived before Linear intake'
      : initiative.routingReason,
    receipts: initiative.receipts.map(receipt =>
      normalizeLegacyReceipt(receipt, routingState)
    ),
    evidence: normalizeLegacyEvidence(
      initiative.evidence,
      routingState,
      legacyKanbanHandle
    ),
  };
}

export async function normalizeLegacyEngineeringInitiativeForStore(
  store: OperatingStore,
  initiative: OvieInitiative,
  options?: { readonly persistence?: 'required' | 'best-effort' }
): Promise<OvieInitiative> {
  const normalized = normalizeLegacyEngineeringInitiative(initiative);
  if (normalized === initiative) return initiative;
  const persisted = {
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
  try {
    await store.putInitiative(persisted);
  } catch (error) {
    if (options?.persistence !== 'best-effort') throw error;
  }
  return persisted;
}
