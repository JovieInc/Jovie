import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';

export function snapshot() {
  const delivery = emptyDeliverySummary();
  return {
    operationalRequestState: 'idle',
    view: {
      connection: 'connected',
      delivery: {
        ...delivery,
        merges: {
          ...delivery.merges,
          since: '2026-10-20T07:00:00.000Z',
          today: { state: 'measured-nonzero', value: 3 },
        },
      },
    },
    operationalTasks: {
      canonicalSource: 'linear',
      cacheMode: 'local-reconciled',
      syncState: 'fresh',
      sourceId: 'lane-pull-requests',
      observedAt: null,
      lastSyncedAt: null,
      freshnessDeadline: null,
      deltas: [],
      tasks: [
        {
          id: 'linear:JOV-1',
          linearIdentifier: 'JOV-1',
          linearUrl: null,
          title: 'Blocked task',
          workflowState: 'blocked',
          priority: 'high',
          attempt: null,
          retryAt: null,
          sourceRevision: null,
          updatedAt: '2026-10-20T18:00:00.000Z',
          pullRequest: null,
        },
      ],
    },
  };
}
