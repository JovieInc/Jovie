import type { GoldenPathSentry } from '@jovie/agent-transport-contracts/pipeline-bottleneck';

export const legacyBottleneckState = {
  ts: '2026-10-23T12:00:00Z',
  metrics: { queue: { waiting: 12 } },
  ranking: [{ id: 'queue', weight: 9000, title: 'Queue is stalled' }],
  unmeasured: ['checkout_latency'],
};

export const goldenPathSentry: GoldenPathSentry = {
  score: 72,
  unresolved_issues: 3,
  users_affected_24h: 12,
  top_issue: { title: 'Checkout failed', flow: 'checkout/upgrade', users: 8 },
  checked_at: '2026-10-23T11:59:00Z',
};
