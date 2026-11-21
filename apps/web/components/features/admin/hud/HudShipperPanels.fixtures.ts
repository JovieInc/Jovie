import type {
  HudGithubRateLimitsPayload,
  HudShipperStatusPayload,
} from '@/types/hud-shipper';

export const shipperPayload: HudShipperStatusPayload = {
  availability: 'available',
  state: 'running',
  isPaused: false,
  launchdLoaded: true,
  lastRunAt: '2026-10-02T12:00:00Z',
  lastResult: 'dispatched',
  dispatchableCount: 3,
  inFlightCount: 1,
  inFlightJobs: [
    {
      job: 'job-1',
      repo: 'JovieInc/Jovie',
      issue: 101,
      branch: 'claude/ds-cert-demo',
      worktree: '/tmp/wt',
      pid: 4242,
      startedAt: '2026-10-02T11:50:00Z',
    },
  ],
  currentAgents: [],
  lastError: null,
  recentErrors: [],
  capacity: null,
  generatedAtIso: '2026-10-02T12:01:00Z',
};

export const longShipperPayload: HudShipperStatusPayload = {
  ...shipperPayload,
  state: 'error',
  lastError:
    'The shipper could not reach the dispatch queue after several retries because the upstream worker kept closing the connection mid-request.',
  recentErrors: Array.from(
    { length: 12 },
    (_, index) => `error ${index + 1}: dispatch queue connection reset`
  ),
};

export const rateLimitsPayload: HudGithubRateLimitsPayload = {
  availability: 'available',
  core: { limit: 5000, remaining: 4200, resetAtIso: '2026-10-02T13:00:00Z' },
  graphql: { limit: 5000, remaining: 3100, resetAtIso: '2026-10-02T13:00:00Z' },
  generatedAtIso: '2026-10-02T12:01:00Z',
};

export const unconfiguredRateLimits: HudGithubRateLimitsPayload = {
  availability: 'not_configured',
  core: null,
  graphql: null,
  generatedAtIso: '2026-10-02T12:01:00Z',
};
