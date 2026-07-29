import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORCHESTRATOR_DIR = resolve(__dirname, '..');

const classifier = await import('../classifier.mjs');
const scorer = await import('../scorer.mjs');
const workstreamer = await import('../workstreamer.mjs');
const reporter = await import('../reporter.mjs');
const staleLease = await import('../stale-lease-guard.mjs');

function makeIssue(overrides = {}) {
  return {
    id: 'test-id',
    identifier: overrides.identifier || 'TEST-001',
    title: overrides.title || 'Test issue',
    description: overrides.description || 'A test issue',
    url: 'https://linear.app/jovie/issue/TEST-001',
    createdAt: overrides.createdAt || '2026-07-01T00:00:00Z',
    updatedAt: overrides.updatedAt || '2026-07-01T12:00:00Z',
    priority: overrides.priority ?? 0,
    estimate: overrides.estimate ?? null,
    assignee: overrides.assignee ?? null,
    pullRequestUrl: overrides.pullRequestUrl ?? null,
    creator: null,
    labels: {
      nodes: overrides.labels ? overrides.labels.map(n => ({ name: n })) : [],
    },
    parent: null,
    children: { nodes: [] },
    relations: { nodes: overrides.relations || [] },
    state: {
      id: 'triage-id',
      name: overrides.state || 'Triage',
      type: 'triage',
    },
    comments: overrides.comments
      ? { nodes: overrides.comments }
      : { nodes: [] },
  };
}

describe('classifier', () => {
  it('classifies a standard issue as triageable', () => {
    const issue = makeIssue({
      identifier: 'JOV-100',
      title: 'Fix login button color',
    });
    const c = classifier.classifyDeterministic(issue, [issue]);
    assert.equal(c.category, 'triageable');
    assert.equal(c.mrrCategory, 'activation');
    assert.ok(c.fingerprint.length === 16);
  });

  it('detects exact duplicates', () => {
    const issues = [
      makeIssue({
        identifier: 'JOV-101',
        title: 'Fix button',
        relations: [
          {
            type: 'duplicate',
            relatedIssue: {
              id: 'o',
              identifier: 'JOV-100',
              title: 'Fix login button',
            },
          },
        ],
      }),
      makeIssue({ identifier: 'JOV-100' }),
    ];
    const c = classifier.classifyDeterministic(issues[0], issues);
    assert.equal(c.category, 'duplicate');
  });

  it('classifies area from labels', () => {
    const c = classifier.classifyDeterministic(
      makeIssue({ title: 'UI fix', labels: ['area:ui'] }),
      []
    );
    assert.equal(c.area, 'ui');
  });

  it('scores duplicates as 0', () => {
    const c = new classifier.IssueClassification(makeIssue());
    c.category = 'duplicate';
    assert.equal(scorer.scoreIssue(c).score, 0);
  });
});

describe('workstreamer', () => {
  it('bundles trivial issues in same area', () => {
    const issues = [
      makeIssue({
        identifier: 'JOV-1',
        title: 'Fix button pad',
        labels: ['area:ui'],
        estimate: 1,
      }),
      makeIssue({
        identifier: 'JOV-2',
        title: 'Fix button col',
        labels: ['area:ui'],
        estimate: 1,
      }),
    ];
    const cs = issues.map(i => classifier.classifyDeterministic(i, issues));
    const ws = workstreamer.bundleWorkstreams(cs);
    assert.ok(ws.some(b => b.issueIds.length >= 2));
  });
});

describe('reporter', () => {
  it('generates valid report', () => {
    const cs = [
      classifier.classifyDeterministic(
        makeIssue({
          identifier: 'JOV-1',
          title: 'Fix sign-in',
          labels: ['launch-blocker'],
        }),
        []
      ),
    ];
    const report = reporter.generateShadowReport({
      total: 1,
      classifications: cs,
      workstreams: [],
      skipped: 0,
    });
    assert.ok(report.includes('JOV-1'));
    assert.ok(report.includes('CLASSIFICATION SUMMARY'));
  });
});

describe('stale lease guard', () => {
  const now = '2026-07-28T12:00:00.000Z';
  const terminalComment = {
    id: 'agent-1',
    createdAt: '2026-07-25T12:00:00.000Z',
    body: 'Jovie agent (codex issue shipper) released this issue for retry.\n\nAgent exited 0 but no open PR exists - releasing claim for retry.',
  };

  function staleIssue(overrides = {}) {
    return makeIssue({
      identifier: overrides.identifier || 'JOV-LEASE-1',
      state: 'In Progress',
      updatedAt: '2026-07-25T12:00:00.000Z',
      comments: [terminalComment],
      ...overrides,
    });
  }

  function fakeClient(issue, { rereads = [], transitionError = null } = {}) {
    const reads = [issue, ...rereads];
    const calls = { comments: [], transitions: [], rereads: 0 };
    return {
      calls,
      async fetchIssue() {
        calls.rereads += 1;
        return reads.shift() || issue;
      },
      async addComment(id, body) {
        calls.comments.push({ id, body });
        if (transitionError === 'comment') throw new Error('comment failed');
        return { success: true };
      },
      async transitionIssue(id, stateId) {
        calls.transitions.push({ id, stateId });
        if (transitionError === 'transition')
          throw new Error('transition failed');
        return { success: true };
      },
    };
  }

  it('does not recover protected-label issues', async () => {
    const client = fakeClient(staleIssue({ labels: ['needs-human'] }));
    const result = await staleLease.sweepStaleLeases({
      issues: [staleIssue({ labels: ['needs-human'] })],
      client,
      now,
    });
    assert.equal(result.recovered.length, 0);
    assert.equal(client.calls.transitions.length, 0);
    assert.equal(result.skipped[0].reason, 'protected-label');
  });

  it('does not recover issues with an active PR', async () => {
    const issue = staleIssue({
      pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/123',
    });
    const client = fakeClient(issue);
    const result = await staleLease.sweepStaleLeases({
      issues: [issue],
      client,
      now,
    });
    assert.equal(result.recovered.length, 0);
    assert.equal(client.calls.comments.length, 0);
    assert.equal(result.skipped[0].reason, 'active-pr');
  });

  it('does not recover assigned or unknown leases', async () => {
    const assigned = staleIssue({ assignee: { id: 'tim', name: 'Tim White' } });
    const unknown = staleIssue({ comments: [] });
    const assignedResult = await staleLease.sweepStaleLeases({
      issues: [assigned],
      client: fakeClient(assigned),
      now,
    });
    const unknownResult = await staleLease.sweepStaleLeases({
      issues: [unknown],
      client: fakeClient(unknown),
      now,
    });
    assert.equal(assignedResult.skipped[0].reason, 'assigned');
    assert.equal(
      unknownResult.skipped[0].reason,
      'latest-agent-evidence-not-terminal'
    );
  });
  it('does not recover a fresh lease', async () => {
    const issue = staleIssue({ updatedAt: '2026-07-27T12:01:00.000Z' });
    const client = fakeClient(issue);
    const result = await staleLease.sweepStaleLeases({
      issues: [issue],
      client,
      now,
    });
    assert.equal(result.recovered.length, 0);
    assert.equal(result.skipped[0].reason, 'lease-too-fresh');
  });

  it('requires terminal latest machine-agent evidence', async () => {
    const issue = staleIssue({
      comments: [
        terminalComment,
        {
          id: 'agent-2',
          createdAt: '2026-07-28T10:00:00.000Z',
          body: 'Jovie agent started a new attempt; work is in progress.',
        },
      ],
    });
    const client = fakeClient(issue);
    const result = await staleLease.sweepStaleLeases({
      issues: [issue],
      client,
      now,
    });
    assert.equal(result.recovered.length, 0);
    assert.equal(
      result.skipped[0].reason,
      'latest-agent-evidence-not-terminal'
    );
  });

  it('recovers a safe stale lease with exactly one stable comment and verified mutations', async () => {
    const issue = staleIssue();
    const rereadAfterComment = staleIssue({
      comments: [
        terminalComment,
        {
          id: 'recovery',
          createdAt: now,
          body: staleLease.STALE_LEASE_RECOVERY_COMMENT,
        },
      ],
    });
    const rereadAfterTransition = staleIssue({
      state: 'Todo',
      comments: [
        terminalComment,
        {
          id: 'recovery',
          createdAt: now,
          body: staleLease.STALE_LEASE_RECOVERY_COMMENT,
        },
      ],
    });
    const client = fakeClient(issue, {
      rereads: [rereadAfterComment, rereadAfterTransition],
    });
    const result = await staleLease.sweepStaleLeases({
      issues: [issue],
      client,
      now,
    });
    assert.equal(result.recovered.length, 1);
    assert.equal(client.calls.comments.length, 1);
    assert.equal(
      client.calls.comments[0].body,
      staleLease.STALE_LEASE_RECOVERY_COMMENT
    );
    assert.equal(client.calls.transitions.length, 1);
    assert.equal(client.calls.rereads, 3);
  });

  it('is idempotent when the recovery comment already exists and issue is Todo', async () => {
    const issue = staleIssue({
      state: 'Todo',
      comments: [
        terminalComment,
        {
          id: 'recovery',
          createdAt: now,
          body: staleLease.STALE_LEASE_RECOVERY_COMMENT,
        },
      ],
    });
    const client = fakeClient(issue);
    const result = await staleLease.sweepStaleLeases({
      issues: [issue],
      client,
      now,
    });
    assert.equal(result.recovered.length, 0);
    assert.equal(client.calls.comments.length, 0);
    assert.equal(client.calls.transitions.length, 0);
    assert.equal(result.skipped[0].reason, 'not-in-progress');
  });

  it('fails closed when a mutation reread does not prove the requested state', async () => {
    const issue = staleIssue();
    const rereadAfterComment = staleIssue({
      comments: [
        terminalComment,
        {
          id: 'recovery',
          body: staleLease.STALE_LEASE_RECOVERY_COMMENT,
          createdAt: now,
        },
      ],
    });
    const client = fakeClient(issue, {
      rereads: [rereadAfterComment, staleIssue()],
    });
    const result = await staleLease.sweepStaleLeases({
      issues: [issue],
      client,
      now,
    });
    assert.equal(result.recovered.length, 0);
    assert.equal(result.failed[0].reason, 'transition-verification-failed');
  });
});

describe('entrypoint contract', () => {
  it('keeps the cron wrapper beside the executable and config', async () => {
    const wrapper = resolve(ORCHESTRATOR_DIR, 'run-backlog.sh');
    const executable = resolve(ORCHESTRATOR_DIR, 'backlog-orchestrator.mjs');
    const config = resolve(ORCHESTRATOR_DIR, 'config.json');

    await Promise.all([access(wrapper), access(executable), access(config)]);
    const wrapperSource = await readFile(wrapper, 'utf8');
    assert.match(wrapperSource, /cd \"\$\(dirname \"\$0\"\)\"/);
    assert.match(wrapperSource, /exec node backlog-orchestrator\.mjs \"\$@\"/);
    assert.match(await readFile(executable, 'utf8'), /Deterministic-first/);
    assert.equal(JSON.parse(await readFile(config, 'utf8')).version, 1);
  });
});
