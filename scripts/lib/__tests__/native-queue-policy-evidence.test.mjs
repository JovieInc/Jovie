import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  checkFailures,
  digest,
  disposition,
  schedulerDeadline,
} from '../native-queue-policy-evidence.mjs';

const head = 'a'.repeat(40),
  base = 'b'.repeat(40);
const at = '2026-09-09T02:00:00.000Z';
const required = [
  'PR Ready',
  'Migration Guard',
  'Fork PR Gate',
  'PR Size Guard',
].map(context => ({ context }));
const policy = {
  required,
  review: { required_approving_review_count: 0 },
  queue: { grouping_strategy: 'ALLGREEN' },
  bypassActors: [],
  classicProtection: null,
  enforcement: 'active',
};
const checks = required.map(r => ({
  name: r.context,
  sha: head,
  state: 'success',
  startedAt: at,
  completedAt: at,
}));
const pr = () => ({
  number: 16237,
  headRefOid: head,
  baseRefOid: base,
  baseRefName: 'main',
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  labels: [],
  files: ['scripts/example.mjs'],
  checks: structuredClone(checks),
  reviewDecision: null,
  isInMergeQueue: false,
  mergeQueueEntry: null,
});

describe('native queue strict acceptance', () => {
  it('classifies eligible PRs only after exact required checks', () => {
    expect(disposition(pr(), policy).type).toBe('ELIGIBLE');
    expect(
      disposition(
        {
          ...pr(),
          isInMergeQueue: true,
          mergeQueueEntry: { id: 'entry', position: 1, state: 'QUEUED' },
        },
        policy
      ).type
    ).toBe('ADMITTED');
  });
  it.each([
    'failure',
    'pending',
    'skipped',
    'neutral',
    'cancelled',
    'timed_out',
    undefined,
  ])('rejects required check %s', state => {
    const p = pr();
    p.checks[0].state = state;
    expect(disposition(p, policy).reasons).toContain(
      `required-check:PR Ready:${state ?? 'missing'}`
    );
  });
  it('does not reuse prior-head green after a push', () => {
    expect(disposition({ ...pr(), headRefOid: base }, policy).type).toBe(
      'INELIGIBLE'
    );
  });
  it('does not reuse an older green check after pending replacement', () => {
    expect(
      checkFailures(
        [
          ...checks,
          { ...checks[0], startedAt: '2026-09-09T02:01:00Z', state: 'pending' },
        ],
        required,
        head
      )
    ).toContain('required-check:PR Ready:pending');
  });
  it.each([
    ['conflict', { mergeable: 'CONFLICTING' }],
    ['unknown', { mergeable: 'UNKNOWN' }],
    ['draft', { isDraft: true }],
    ['hold', { labels: ['hold'] }],
    ['changes requested', { reviewDecision: 'CHANGES_REQUESTED' }],
    ['missing checks', { checks: [] }],
    ['missing files', { files: null }],
    ['changelog', { files: ['CHANGELOG.md'] }],
  ])('does not admit %s', (_, patch) =>
    expect(disposition({ ...pr(), ...patch }, policy).type).toBe('INELIGIBLE'));
  it('enforces required reviews', () => {
    expect(
      disposition(pr(), {
        ...policy,
        review: { required_approving_review_count: 1 },
      }).reasons
    ).toContain('required-review');
  });
  it('does not count auto-merge intent as positioned admission', () => {
    expect(
      disposition({ ...pr(), autoMergeRequest: { enabledAt: at } }, policy).type
    ).toBe('ELIGIBLE');
  });
  it('rejects wrong check authority and future completion', () => {
    expect(
      checkFailures(checks, [{ context: 'PR Ready', integration_id: 42 }], head)
    ).toHaveLength(1);
    expect(
      checkFailures(checks, required, head, Date.parse(at) - 1)
    ).toHaveLength(4);
  });
});

function source(path, content) {
  return {
    path,
    ref: base,
    encoding: 'base64',
    content: Buffer.from(content).toString('base64'),
    sha: createHash('sha1')
      .update(`blob ${Buffer.byteLength(content)}\0`)
      .update(content)
      .digest('hex'),
  };
}
function scheduler() {
  return {
    workflow: source(
      '.github/workflows/merge-queue-autoenroll.yml',
      'on:\n  workflow_run:\nconcurrency:\n  group: merge-queue-drain-mutex\n  cancel-in-progress: false\njobs:\n  fleet-policy:\n    timeout-minutes: 5\n  enroll:\n    steps: []\n'
    ),
    drain: source(
      'scripts/drain-pr-queue.sh',
      'DRAIN_MAX_SECONDS="${DRAIN_MAX_SECONDS:-900}"'
    ),
  };
}
describe('immutable policy-source diagnostic window', () => {
  it('derives the 20-minute cohort window from actual source budgets', () => {
    expect(schedulerDeadline(scheduler(), base)).toBe(1200000);
    expect(digest(policy)).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([
    null,
    {},
    { verified: true, admissionDeadlineMs: 1000 },
  ])('rejects missing source %s', input => {
    expect(schedulerDeadline(input, base)).toBeNull();
  });
  it.each([
    [
      'wrong revision',
      s => {
        s.workflow.ref = head;
      },
    ],
    [
      'wrong path',
      s => {
        s.drain.path = 'other';
      },
    ],
    [
      'unverified content',
      s => {
        s.workflow.content = Buffer.from('altered source').toString('base64');
      },
    ],
    [
      'wrong encoding',
      s => {
        s.workflow.encoding = 'utf8';
      },
    ],
    [
      'missing event or budget',
      s => {
        s.workflow = source(s.workflow.path, 'name: unavailable');
      },
    ],
    [
      'missing drain budget',
      s => {
        s.drain = source(s.drain.path, '# no budget');
      },
    ],
  ])('rejects %s', (_, mutate) => {
    const s = scheduler();
    mutate(s);
    expect(schedulerDeadline(s, base)).toBeNull();
  });
});
