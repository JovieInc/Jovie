import { planQueueRecovery } from '../../merge-queue-recovery.mjs';

const NOW = Date.parse('2026-11-13T05:00:00Z');
const at = minutes => new Date(NOW + minutes * 60_000).toISOString();
const sha = c => c.repeat(40);
const checks = (state = 'SUCCESS') => ({
  state,
  contexts: {
    nodes: [
      {
        name: 'PR Ready',
        conclusion: state,
        completedAt: at(-1),
        detailsUrl:
          'https://github.com/JovieInc/Jovie/actions/runs/123/job/456',
        checkSuite: { app: { slug: 'github-actions' } },
      },
    ],
    pageInfo: { hasNextPage: false },
  },
});
const commit = (c, state = 'SUCCESS') => ({
  oid: sha(c),
  statusCheckRollup: checks(state),
});
const labels = { nodes: [], pageInfo: { hasNextPage: false } };
const repair = (extra = {}) => ({
  number: 10,
  headRefOid: sha('a'),
  body: 'JOV-8775',
  isDraft: false,
  labels,
  commits: { nodes: [{ commit: commit('a', 'FAILURE') }] },
  ...extra,
});
const issue = {
  id: 'issue-id',
  identifier: 'JOV-8775',
  description: '',
  labels,
  state: { name: 'Todo', type: 'unstarted' },
  attachments: {
    nodes: [{ url: 'https://github.com/JovieInc/Jovie/pull/10' }],
    pageInfo: { hasNextPage: false },
  },
};
const runtime = (running = [], minutes = 0) => ({
  generated_at: at(minutes),
  running,
  retrying: [],
  blocked: [],
});
const worker = (extra = {}) => ({
  issue_identifier: 'JOV-8775',
  session_id: 'worker-1',
  last_event_at: at(0),
  ...extra,
});
const snapshot = (extra = {}) => ({
  known: true,
  closure: null,
  linkedRepairs: [],
  observedAt: at(0),
  queued: 1,
  eligible: [],
  open: [repair()],
  merged: [],
  failures: [
    {
      check: 'Unit Tests 7/14',
      head: sha('b'),
      url: 'https://github.com/JovieInc/Jovie/actions/runs/123/job/456',
    },
  ],
  lastMergeAt: at(-180),
  main: null,
  ...extra,
});
function plan(previous = null, extra = {}) {
  return planQueueRecovery({
    row: { status: 'stale', budgetMinutes: 45 },
    snapshot: snapshot(),
    incident: { known: true, issue },
    previous: previous && { recovery: previous },
    runtime: runtime(),
    nowMs: NOW,
    ...extra,
  });
}

export {
  at,
  checks,
  commit,
  issue,
  labels,
  NOW,
  plan,
  repair,
  runtime,
  sha,
  snapshot,
  worker,
};
