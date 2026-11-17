import type {
  FleetAuditCorrelation,
  FleetAuditEvent,
  FleetAuditResult,
  FleetAuditSummary,
} from '@/lib/ovie/fleet-audit';

/** Shared fixtures for the FleetAuditPanel state stories and tests. */
export const fleetEvent: FleetAuditEvent = {
  id: 'e1',
  ts: '2026-10-29T10:00:00.000Z',
  actor_agent: 'claude-lane-3',
  session_id: null,
  host: 'gem',
  repo: 'JovieInc/Jovie',
  target: 'JovieInc/Jovie#123',
  action: 'pr.merge',
  danger: 1,
  reason: 'queue drained',
  issue: null,
  outcome: 'ok',
  before: null,
  after: null,
  source: 'gh-shim',
};

export const fleetUnattributed: FleetAuditCorrelation = {
  id: 'c1',
  observed_at: '2026-10-29T11:00:00.000Z',
  repo: 'JovieInc/Jovie',
  target: 'JovieInc/Jovie#124',
  change: 'label.add',
  github_actor: 'itstimwhite',
  matched_event_id: null,
  status: 'unattributed',
};

export function fleetSummary(
  overrides: Partial<FleetAuditSummary> = {}
): FleetAuditResult<FleetAuditSummary> {
  return {
    state: 'ok',
    data: {
      budget: { bytes_month: 25_000, limit_bytes: 100_000, pct: 25 },
      dangerous: [],
      unattributed: [],
      counts: { events_24h: 0, events_7d: 0 },
      ...overrides,
    },
  };
}
