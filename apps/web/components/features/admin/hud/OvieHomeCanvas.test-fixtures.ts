import type { OvieInbox } from '@/lib/ovie/inbox';
import { INTERACTION_CASE_CONTRACT } from '@/lib/ovie/interaction-case';
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

export const INBOX: OvieInbox = {
  issues: [],
  cases: [
    {
      contract: INTERACTION_CASE_CONTRACT,
      id: 'summer:card-1',
      kind: 'spend',
      source: { system: 'summer', id: 'card-1', revision: null },
      title: 'Vercel on-demand concurrency',
      recommendation: 'Approve the small monthly cost',
      owner: null,
      state: 'needs_you',
      priority: 1,
      createdAt: '2026-10-20T18:00:00.000Z',
      nextAction: null,
      waitingUntil: null,
      confidence: null,
      evidence: [],
      body: 'Preview floods stalled production for five hours.',
      decisionTarget: { kind: 'summer', id: 'card-1' },
    },
  ],
};

/** Every Home read the canvas makes, answered as ready. */
export const COMPANY_RESPONSES: Record<string, unknown> = {
  '/api/hud/metrics': {
    overview: {
      mrrUsd: 0,
      activeSubscribers: 0,
      balanceUsd: 22.96,
      burnRateUsd: 110,
      runwayMonths: 0.2,
      defaultStatus: 'dead',
      defaultStatusDetail: '',
      financialDataAvailable: true,
      weekAgo: { mrrUsd: 0, activeSubscribers: 0 },
    },
  },
  '/api/admin/hud/founder-funnel?range=7d': {
    stages: [{ key: 'accounts_created', count: 2, drillDownHref: null }],
  },
  '/api/ovie/certifications': {
    rows: [
      {
        domain: 'flows',
        state: 'working',
        tiers: { runtime_dogfood: 'passed' },
      },
    ],
  },
  '/api/ovie/home/blocker': {
    generatedAt: '2026-11-08T23:00:00.000Z',
    blocker: null,
  },
};
