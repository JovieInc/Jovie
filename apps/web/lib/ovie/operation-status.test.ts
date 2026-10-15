import { describe, expect, it } from 'vitest';
import {
  resolveOvieApprovalStatus,
  resolveOvieTaskStatus,
} from './operation-status';
import type { SummerCard } from './summer-cards';
import type { SummerKanbanCard } from './summer-kanban';

const approval: SummerCard = {
  id: 'sc_11111111111111111111111111111111',
  kind: 'decision',
  product: 'company',
  title: 'Approve source research',
  body: 'Inspect the source before preparing a draft.',
  recommendation: 'Inspect the source',
  defaultIfSilent: null,
  recipient: null,
  amountUsd: null,
  evidence: [],
  status: 'pending',
  comment: null,
  createdAt: '2026-10-10T12:00:00Z',
  decidedAt: null,
};
const task: SummerKanbanCard = {
  workId: 'work_source-research',
  idempotencyKey: 'source-research-attempt-1',
  title: 'Inspect source',
  lane: 'heavy',
  routingState: 'in_progress',
  owner: 'summer',
  status: 'executing',
  freshness: [
    {
      source: 'initiative-record',
      state: 'fresh',
      observedAt: '2026-10-10T12:00:00Z',
      freshnessDeadline: '2026-10-10T12:10:00Z',
    },
  ],
  availability: 'available',
  blocker: { state: 'not-blocked' },
  nextAction: 'Inspect source',
  nextProof: 'Saved source inspection',
  terminalEvidence: null,
};
const complete: SummerKanbanCard = {
  ...task,
  routingState: 'done',
  status: 'verified',
  terminalEvidence: {
    state: 'proven',
    ref: 'source-inspection:attempt-1',
    url: null,
    summary: 'Saved source inspection',
    observedAt: '2026-10-10T12:01:00Z',
  },
};

describe('Ovie task and approval receipt fixtures', () => {
  it('keeps approval pending until a saved decision, independently of execution', () => {
    expect(resolveOvieApprovalStatus(approval)).toBe('pending');
    expect(resolveOvieApprovalStatus({ ...approval, status: 'approved' })).toBe(
      'unknown'
    );
    expect(
      resolveOvieApprovalStatus({
        ...approval,
        status: 'approved',
        decidedAt: '2026-10-10T12:01:00Z',
      })
    ).toBe('succeeded');
    expect(
      resolveOvieApprovalStatus({
        ...approval,
        status: 'approved',
        decidedAt: 'invalid',
      })
    ).toBe('unknown');
    expect(
      resolveOvieApprovalStatus({
        ...approval,
        status: 'rejected',
        decidedAt: '2026-10-10T12:01:00Z',
      })
    ).toBe('cancelled');
    expect(resolveOvieTaskStatus(task)).toBe('working');
  });

  it('requires fresh task completion evidence, not just routing or partial implementation', () => {
    expect(resolveOvieTaskStatus(complete)).toBe('succeeded');
    expect(resolveOvieTaskStatus({ ...complete, terminalEvidence: null })).toBe(
      'unknown'
    );
    expect(resolveOvieTaskStatus({ ...complete, freshness: [] })).toBe(
      'unknown'
    );
    expect(
      resolveOvieTaskStatus({
        ...complete,
        freshness: task.freshness.map(source => ({
          ...source,
          state: 'stale',
        })),
      })
    ).toBe('unknown');
    expect(resolveOvieTaskStatus({ ...complete, status: 'implemented' })).toBe(
      'pending'
    );
    expect(resolveOvieTaskStatus({ ...complete, routingState: 'landed' })).toBe(
      'pending'
    );
    expect(resolveOvieTaskStatus({ ...task, status: 'failed' })).toBe('failed');
    expect(
      resolveOvieTaskStatus({ ...task, availability: 'unavailable' })
    ).toBe('failed');
    expect(resolveOvieTaskStatus({ ...task, status: 'cancelled' })).toBe(
      'cancelled'
    );
  });
});
