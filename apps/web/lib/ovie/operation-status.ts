import {
  type OperationStatus,
  resolveOperationStatus,
} from '@jovie/ui/lib/utils';
import type { SummerCard } from './summer-cards';
import type { SummerKanbanCard } from './summer-kanban';

/** Read-only adapters for the separately owned Ovie consumer; no status store. */
export function resolveOvieTaskStatus(card: SummerKanbanCard): OperationStatus {
  const fresh =
    card.freshness.length > 0 &&
    card.freshness.every(source => source.state === 'fresh');
  const operationKey = `${card.workId}:${card.idempotencyKey}`;
  const complete =
    ['verified', 'certified', 'rolled-out'].includes(card.status) &&
    card.routingState === 'done';
  const state = !fresh
    ? 'unknown'
    : card.status === 'cancelled'
      ? 'cancelled'
      : card.status === 'failed' || card.availability === 'unavailable'
        ? 'failed'
        : complete
          ? 'succeeded'
          : card.status === 'executing' && card.routingState === 'in_progress'
            ? 'working'
            : 'pending';
  return resolveOperationStatus({
    operationKey,
    state,
    active: fresh && state === 'working',
    receipt:
      card.terminalEvidence?.state === 'proven' && card.terminalEvidence.ref
        ? { operationKey, state: 'succeeded', persisted: true }
        : undefined,
  });
}

/** An approval decision is its own operation; approval never completes its task. */
export function resolveOvieApprovalStatus(card: SummerCard): OperationStatus {
  const operationKey = `${card.id}:${card.decidedAt ?? 'pending'}`;
  return resolveOperationStatus({
    operationKey,
    state:
      card.status === 'pending'
        ? 'pending'
        : card.status === 'rejected'
          ? 'cancelled'
          : card.status === 'approved'
            ? 'succeeded'
            : 'unknown',
    active: false,
    receipt:
      card.decidedAt && Number.isFinite(Date.parse(card.decidedAt))
        ? { operationKey, state: 'succeeded', persisted: true }
        : undefined,
  });
}
