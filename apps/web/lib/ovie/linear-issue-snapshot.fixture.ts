import type { LinearIssueSnapshotDeps } from './linear-issue-snapshot.server';
import type { LinearIssueRow } from './linear-issue-task-view';

/**
 * Deterministic JOV issues for the visual suite. The admin Shipping page reads
 * Linear on the server, where Playwright's `page.route` cannot reach, so CI
 * would otherwise capture the "Linear not reachable" state. Only
 * `resolveLinearIssueSnapshotDeps` selects this, and only while the gated
 * E2E test mode is on (never on Vercel preview or production).
 */
export const LINEAR_ISSUE_FIXTURE: readonly LinearIssueRow[] = [
  {
    id: 'fixture-linear-1',
    identifier: 'JOV-9001',
    title: 'Fixture: ship the profile claim flow',
    url: 'https://linear.app/jovie/issue/JOV-9001',
    priority: 2,
    state: { name: 'In Progress', type: 'started' },
    assignee: 'Fixture Owner',
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-20T09:00:00.000Z',
  },
  {
    id: 'fixture-linear-2',
    identifier: 'JOV-9002',
    title: 'Fixture: tighten release readiness checks',
    url: 'https://linear.app/jovie/issue/JOV-9002',
    priority: 3,
    state: { name: 'Todo', type: 'unstarted' },
    assignee: null,
    createdAt: '2026-11-02T09:00:00.000Z',
    updatedAt: '2026-11-19T09:00:00.000Z',
  },
  {
    id: 'fixture-linear-3',
    identifier: 'JOV-9003',
    title: 'Fixture: triage inbound artist requests',
    url: 'https://linear.app/jovie/issue/JOV-9003',
    priority: 4,
    state: { name: 'Backlog', type: 'backlog' },
    assignee: null,
    createdAt: '2026-11-03T09:00:00.000Z',
    updatedAt: '2026-11-18T09:00:00.000Z',
  },
];

/** No Redis, so the fixture never writes the shared snapshot key. */
export function linearIssueFixtureDeps(
  now: () => Date = () => new Date()
): LinearIssueSnapshotDeps {
  return {
    redis: null,
    fetchIssues: async () => LINEAR_ISSUE_FIXTURE,
    now,
  };
}
