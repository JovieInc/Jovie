export const SINCE = '2026-10-20T07:00:00.000Z';

import {
  type CountMeasurement,
  type DeliverySummary,
  emptyDeliverySummary,
} from '@/lib/ovie/shipping-state/contract';
export function count(value: number | null): CountMeasurement {
  if (value === null) return { state: 'not-measured', value: null };
  if (value === 0) return { state: 'measured-zero', value: 0 };
  return { state: 'measured-nonzero', value };
}

export function delivery(
  patch: Partial<DeliverySummary> = {}
): DeliverySummary {
  return { ...emptyDeliverySummary(), ...patch };
}

export function measuredDelivery(): DeliverySummary {
  const empty = emptyDeliverySummary();
  return delivery({
    lanes: {
      ...empty.lanes,
      running: count(3),
      slots: count(4),
      diskFreePct: 18.4,
      heldByReason: { budget: 0 },
      publishedAt: '2026-10-20T18:00:00.000Z',
    },
    merges: {
      ...empty.merges,
      since: SINCE,
      today: count(7),
      last7Days: count(40),
      prior7Days: count(31),
    },
    mergeQueueDepth: count(2),
    production: {
      sha: 'c9b767a1234567890',
      version: null,
      deployedAt: null,
      behindMain: count(0),
    },
  });
}

export function onTargetDelivery(): DeliverySummary {
  const base = measuredDelivery();
  return delivery({
    ...base,
    lanes: {
      ...base.lanes,
      running: count(4),
      slots: count(4),
      flow: {
        openPrs: 40,
        redPrs: 2,
        dirtyPrs: 0,
        cleanNotQueued: 0,
        exhaustedPrs: 0,
        mergesPerHour: 2,
        queueEjectionRate: 0.05,
        queueWaitP95Seconds: 600,
        productionLagP95Seconds: 900,
        eligiblePool: 5,
        candidatePool: 8,
        ownerless: 0,
        regressions: [],
        at: '2026-10-20T18:00:00.000Z',
      },
    },
    merges: { ...base.merges, last7Days: count(175), prior7Days: count(140) },
  });
}
