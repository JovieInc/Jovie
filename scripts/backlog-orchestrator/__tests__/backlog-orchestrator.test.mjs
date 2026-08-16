import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORCHESTRATOR_DIR = resolve(__dirname, '..');
const execFileAsync = promisify(execFile);

const classifier = await import('../classifier.mjs');
const { reconcileIssues } = await import('../reconcile.mjs');
const linear = await import('../linear-client.mjs');
const scorer = await import('../scorer.mjs');
const workstreamer = await import('../workstreamer.mjs');
const reporter = await import('../reporter.mjs');
const staleLease = await import('../stale-lease-guard.mjs');
const admitter = await import('../admitter.mjs');
const routing = await import('../symphony-routing.mjs');
const triageRouter = await import('../triage-router.mjs');
const deterministicGates = await import('../deterministic-gates.mjs');

describe('team production health contract', () => {
  it('uses a direct bounded LYB artifact instead of the redirecting homepage', async () => {
    const source = await readFile(
      resolve(ORCHESTRATOR_DIR, 'backlog-orchestrator.mjs'),
      'utf8'
    );

    assert.match(
      source,
      /healthUrl: 'https:\/\/www\.logyourbody\.com\/robots\.txt'/
    );
    assert.doesNotMatch(source, /healthUrl: 'https:\/\/logyourbody\.com'/);
  });
});

function routingComment(issue) {
  const decision = routing.selectSymphonyRoute({ issue });
  assert.equal(decision.status, 'selected');
  return { body: routing.buildRoutingReceipt(decision.route) };
}

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
    parent: overrides.parent ?? null,
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

  it('counts only fresh active machine leases, not ordinary In Progress work', () => {
    const now = '2026-08-03T12:00:00.000Z';
    const activeMachineLease = makeIssue({
      state: 'In Progress',
      comments: [
        {
          body: 'machine-agent running process: 123 workspace: /tmp/jovie branch: fix/JOV-1',
          createdAt: '2026-08-03T11:00:00.000Z',
        },
      ],
    });
    assert.deepEqual(
      scorer.currentShippingLoad(
        [
          makeIssue({ state: 'Todo' }),
          makeIssue({ state: 'In Progress' }),
          activeMachineLease,
        ],
        { now }
      ),
      { healthy: true, count: 1 }
    );
  });

  it('excludes Tim-owned and protected machine-looking work', () => {
    const evidence = [
      {
        body: 'machine-agent running process: 123 workspace: /tmp/jovie branch: fix/JOV-1',
        createdAt: '2026-08-03T11:00:00.000Z',
      },
    ];
    const now = '2026-08-03T12:00:00.000Z';
    assert.deepEqual(
      scorer.currentShippingLoad(
        [
          makeIssue({
            assignee: { id: 'tim', name: 'Tim White' },
            state: 'In Progress',
            comments: evidence,
          }),
          makeIssue({
            labels: ['needs-human'],
            state: 'In Progress',
            comments: evidence,
          }),
        ],
        { now }
      ),
      { healthy: true, count: 0 }
    );
  });

  it('fails closed for stale, terminal, and ambiguous machine evidence', () => {
    const now = '2026-08-03T12:00:00.000Z';
    const base = (body, createdAt = '2026-08-03T11:00:00.000Z') => ({
      body,
      createdAt,
    });
    assert.deepEqual(
      scorer.currentShippingLoad(
        [
          makeIssue({
            state: 'In Progress',
            comments: [
              base(
                'machine-agent running process: 1 workspace: /tmp/x branch: fix/x'
              ),
            ],
          }),
          makeIssue({
            state: 'In Progress',
            comments: [
              base(
                'machine-agent completed process: 2 workspace: /tmp/x branch: fix/y'
              ),
            ],
          }),
          makeIssue({
            state: 'In Progress',
            comments: [
              base('machine-agent running process: 3 workspace: /tmp/x'),
            ],
          }),
          makeIssue({
            state: 'In Progress',
            comments: [
              base(
                'machine-agent running process: 4 workspace: /tmp/x branch: fix/stale',
                '2026-08-01T00:00:00.000Z'
              ),
            ],
          }),
        ],
        { now }
      ),
      { healthy: true, count: 1 }
    );
  });

  it('returns a stable zero-load read-back when no valid lease is present', () => {
    const now = '2026-08-03T12:00:00.000Z';
    const snapshot = [
      makeIssue({
        state: 'In Progress',
        comments: [
          {
            body: 'machine-agent running',
            createdAt: '2026-08-03T11:00:00.000Z',
          },
        ],
      }),
    ];
    assert.deepEqual(scorer.currentShippingLoad(snapshot, { now }), {
      healthy: true,
      count: 0,
    });
    assert.deepEqual(scorer.currentShippingLoad(snapshot, { now }), {
      healthy: true,
      count: 0,
    });
  });
});

describe('reconciliation idempotency', () => {
  it('does not repost a classification when only the persisted comment changes updatedAt', async () => {
    const issue = makeIssue({ identifier: 'JOV-4530' });
    let nextUpdatedAt = issue.updatedAt;
    const calls = { comments: [] };
    const client = {
      async addComment(issueId, body) {
        calls.comments.push({ issueId, body });
        issue.comments.nodes.push({
          id: `comment-${calls.comments.length}`,
          body,
          createdAt: `2026-07-01T12:0${calls.comments.length}:00Z`,
        });
        nextUpdatedAt = `2026-07-01T12:0${calls.comments.length}:30Z`;
      },
    };

    const reread = () => ({ ...issue, updatedAt: nextUpdatedAt });
    await reconcileIssues({ issues: [reread()], client });
    await reconcileIssues({ issues: [reread()], client });

    assert.equal(calls.comments.length, 1);
  });

  it('returns a deterministic dry-run receipt with no mutations', async () => {
    const issue = makeIssue({ identifier: 'JOV-4604' });
    const receipt = await reconcileIssues({
      issues: [issue],
      client: {
        async addComment() {
          throw new Error('must not mutate');
        },
      },
      isDryRun: true,
      backlogStateId: 'backlog-id',
    });
    assert.equal(receipt.schema, 'backlog-orchestrator/reconcile/v1');
    assert.equal(receipt.mode, 'dry-run');
    assert.equal(receipt.mutations, 0);
    assert.equal(receipt.classified, 1);
    assert.equal(receipt.results[0].identifier, 'JOV-4604');
  });
});

describe('deterministic triage routing', () => {
  it('fails the controller instead of reporting team errors as green', () => {
    assert.throws(
      () =>
        deterministicGates.assertNoTeamControllerErrors([
          { team: 'JOV', stage: 'team-error', status: 'blocked' },
        ]),
      /one or more team controllers errored/
    );
    assert.doesNotThrow(() =>
      deterministicGates.assertNoTeamControllerErrors([
        { team: 'JOV', stage: 'selection', status: 'blocked' },
      ])
    );
  });

  it('routes incidents, follow-ups, and ready work out of Triage', () => {
    const states = { backlogStateId: 'backlog-id', todoStateId: 'todo-id' };
    const classification = { category: 'triageable' };
    assert.equal(
      triageRouter.routeTriageIssue(
        makeIssue({ labels: ['incident'] }),
        classification,
        states
      ).desiredStateId,
      'todo-id'
    );
    const followup = triageRouter.routeTriageIssue(
      makeIssue({ description: '## Follow-up\nCurrent issue: JOV-42' }),
      classification,
      states
    );
    assert.equal(followup.desiredStateId, 'backlog-id');
    assert.equal(followup.parentIdentifier, 'JOV-42');
    assert.equal(
      triageRouter.routeTriageIssue(
        makeIssue({ labels: ['agent-ready'] }),
        classification,
        states
      ).desiredStateId,
      'todo-id'
    );
  });

  it('keeps only genuine intake in Triage and flags stale ready work', () => {
    const issue = makeIssue({ updatedAt: '2026-07-01T11:50:00Z' });
    const route = triageRouter.routeTriageIssue(
      issue,
      { category: 'triageable' },
      { backlogStateId: 'backlog-id', todoStateId: 'todo-id' }
    );
    assert.equal(route.reason, 'genuine-intake');
    assert.equal(route.desiredStateId, null);

    const watchdog = triageRouter.buildAgentReadyTriageWatchdog(
      [
        makeIssue({
          labels: ['agent-ready'],
          updatedAt: '2026-07-01T11:50:00Z',
        }),
      ],
      { now: new Date('2026-07-01T12:00:00Z') }
    );
    assert.equal(watchdog.status, 'blocked');
    assert.deepEqual(
      watchdog.violations.map(item => item.identifier),
      ['TEST-001']
    );
  });

  it('routes an unchanged stored classification instead of skipping it', async () => {
    const issue = makeIssue({ labels: ['agent-ready'] });
    const classification = classifier.classifyDeterministic(issue, [issue]);
    issue.comments.nodes.push({
      id: 'stored',
      body: classifier.buildStoredClassification(classification),
      createdAt: issue.updatedAt,
    });
    const transitions = [];
    const receipt = await reconcileIssues({
      issues: [issue],
      client: {
        async transitionIssue(issueId, stateId) {
          transitions.push({ issueId, stateId });
        },
      },
      backlogStateId: 'backlog-id',
      todoStateId: 'todo-id',
    });
    assert.equal(receipt.skipped, 0);
    assert.equal(receipt.failed, 0);
    assert.deepEqual(transitions, [{ issueId: 'test-id', stateId: 'todo-id' }]);
  });
});

describe('Linear transport', () => {
  it('classifies Linear deprecated GraphQL responses distinctly', () => {
    assert.equal(
      linear.classifyGraphQLErrors([
        {
          message: 'deprecated',
          extensions: { userPresentableMessage: 'This endpoint deprecated.' },
        },
      ]),
      'DEPRECATED'
    );
    assert.equal(
      linear.classifyGraphQLErrors([{ message: 'forbidden' }]),
      'API'
    );
  });

  it('classifies a deprecated GraphQL response as a deprecated API error', async () => {
    process.env.LINEAR_API_KEY = 'deprecated-secret';
    await assert.rejects(
      linear.graphql(
        'query Deprecated { viewer { id } }',
        {},
        {
          /** @type {any} */
          fetchImpl: async () => ({
            json: async () => ({
              errors: [
                {
                  message: 'deprecated',
                  extensions: {
                    userPresentableMessage: 'This endpoint deprecated.',
                  },
                },
              ],
            }),
          }),
        }
      ),
      error => {
        const err = /** @type {any} */ (error);
        return (
          err?.code === 'DEPRECATED' &&
          !String(err?.message ?? '').includes('deprecated-secret')
        );
      }
    );
  });

  it('looks up issue keys with the supported team and number filter', async () => {
    const previous = process.env.LINEAR_API_KEY;
    process.env.LINEAR_API_KEY = 'query-secret';
    /** @type {any} */
    let request;
    const issue = { id: 'issue-4594', identifier: 'JOV-4594', project: null };
    const result = await linear.fetchIssue('JOV-4594', {
      fetchImpl: async (_url, options) => {
        request = JSON.parse(options.body);
        return { json: async () => ({ data: { issues: { nodes: [issue] } } }) };
      },
    });
    assert.deepEqual(result, issue);
    assert.ok(request);
    assert.match(request.query, /issues\s*\(/);
    assert.doesNotMatch(request.query, /issueSearch/);
    assert.deepEqual(request.variables, { teamKey: 'JOV', number: 4594 });
    if (previous === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = previous;
  });

  it('retries transient fetch failures and preserves the raw Linear auth format', async () => {
    const previous = process.env.LINEAR_API_KEY;
    process.env.LINEAR_API_KEY = 'test-secret-that-must-not-leak';
    let attempts = 0;
    const sleeps = [];
    /** @type {any} */
    const fetchImpl = async (_url, options) => {
      attempts += 1;
      const headers = /** @type {Record<string, string>} */ (options.headers);
      assert.equal(headers.Authorization, process.env.LINEAR_API_KEY);
      if (attempts < 3) {
        throw Object.assign(new Error('fetch failed'), { code: 'ETIMEDOUT' });
      }
      return { json: async () => ({ data: { viewer: { id: 'viewer' } } }) };
    };
    const data = await linear.graphql(
      'query Test { viewer { id } }',
      {},
      {
        fetchImpl,
        sleepImpl: async ms => {
          sleeps.push(ms);
        },
        retryBaseMs: 7,
      }
    );
    assert.deepEqual(data, { viewer: { id: 'viewer' } });
    assert.equal(attempts, 3);
    assert.deepEqual(sleeps, [7, 14]);
    if (previous === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = previous;
  });

  it('classifies an exhausted abort as a timeout without logging the secret', async () => {
    const previous = process.env.LINEAR_API_KEY;
    process.env.LINEAR_API_KEY = 'timeout-secret';
    await assert.rejects(
      linear.graphql(
        'query Timeout { viewer { id } }',
        {},
        {
          timeoutMs: 1,
          maxAttempts: 1,
          fetchImpl: (_url, options) =>
            new Promise((_resolve, reject) => {
              options.signal.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError'))
              );
            }),
        }
      ),
      error => {
        const err = /** @type {{ code?: unknown; message?: string }} */ (error);
        return (
          err.code === 'TIMEOUT' &&
          !String(err.message ?? '').includes('timeout-secret')
        );
      }
    );
    if (previous === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = previous;
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
    const executableSource = await readFile(executable, 'utf8');
    assert.match(executableSource, /Deterministic-first/);
    for (const dependency of [
      'linear-client.mjs',
      'classifier.mjs',
      'reconcile.mjs',
      'scorer.mjs',
      'workstreamer.mjs',
      'admitter.mjs',
      'reporter.mjs',
      'runtime-state.mjs',
      'stale-lease-guard.mjs',
    ]) {
      assert.match(
        executableSource,
        new RegExp(`from ['"]\\./${dependency}['"]`),
        `entrypoint must declare ${dependency} in its static dependency closure`
      );
    }
    assert.equal(JSON.parse(await readFile(config, 'utf8')).version, 1);
    assert.match(executableSource, /runtimeState\.resolveCacheFile/);
    assert.doesNotMatch(
      executableSource,
      /CACHE_FILE = resolve\(__dirname, '\.orchestrator-cache\.json'\)/
    );
  });

  it('preserves an injected key and falls back to the configured file', async () => {
    const tempDir = await mkdtemp('/tmp/backlog-wrapper-');
    const fakeBin = resolve(tempDir, 'bin');
    await mkdir(fakeBin, { recursive: true });
    const fakeNode = resolve(fakeBin, 'node');
    await writeFile(
      fakeNode,
      '#!/usr/bin/env bash\nprintf \'%s\\n\' "${LINEAR_API_KEY:-}" > "$WRAPPER_KEY_OUTPUT"\nprintf \'%s\\n\' "$*" > "$WRAPPER_ARGS_OUTPUT"\n'
    );
    await execFileAsync('chmod', ['+x', fakeNode]);

    const run = env =>
      execFileAsync(resolve(ORCHESTRATOR_DIR, 'run-backlog.sh'), ['dry-run'], {
        env: {
          ...process.env,
          ...env,
          PATH: `${fakeBin}:${process.env.PATH}`,
        },
      });

    const keyOutput = resolve(tempDir, 'key');
    const argsOutput = resolve(tempDir, 'args');
    await run({
      HOME: resolve(tempDir, 'missing-home'),
      LINEAR_API_KEY: 'injected-key',
      WRAPPER_KEY_OUTPUT: keyOutput,
      WRAPPER_ARGS_OUTPUT: argsOutput,
    });
    assert.equal(await readFile(keyOutput, 'utf8'), 'injected-key\n');
    assert.equal(
      await readFile(argsOutput, 'utf8'),
      'backlog-orchestrator.mjs dry-run\n'
    );

    const fileHome = resolve(tempDir, 'file-home');
    await mkdir(resolve(fileHome, '.config/symphony'), { recursive: true });
    await writeFile(
      resolve(fileHome, '.config/symphony/linear.env'),
      'file-key\n'
    );
    await run({
      HOME: fileHome,
      LINEAR_API_KEY: '',
      WRAPPER_KEY_OUTPUT: keyOutput,
      WRAPPER_ARGS_OUTPUT: argsOutput,
    });
    assert.equal(await readFile(keyOutput, 'utf8'), 'file-key\n');
  });

  it('fails clearly when neither credential source exists', async () => {
    await assert.rejects(
      execFileAsync(resolve(ORCHESTRATOR_DIR, 'run-backlog.sh'), ['dry-run'], {
        env: {
          ...process.env,
          HOME: '/tmp/no-backlog-credentials',
          LINEAR_API_KEY: '',
        },
      }),
      error => {
        const err = /** @type {{ stderr?: unknown; message?: unknown }} */ (
          error
        );
        return /LINEAR_API_KEY is not set and credential file is unavailable/.test(
          `${err.stderr ?? err.message ?? error}`
        );
      }
    );
  });
});

describe('deterministic Symphony admission boundary', () => {
  function admissionIssue(overrides = {}) {
    return makeIssue({
      id: overrides.id || `${overrides.identifier || 'JOV-900'}-id`,
      identifier: overrides.identifier || 'JOV-900',
      title: overrides.title || 'Fix the real thing',
      state: overrides.state || 'Triage',
      labels: overrides.labels || ['plan-approved', 'admission-approved'],
      assignee: overrides.assignee || null,
      comments: overrides.comments || [],
      ...overrides,
    });
  }

  function classification(issue) {
    return {
      identifier: issue.identifier,
      title: issue.title,
      category: 'triageable',
      mrrCategory: 'reliability',
      mrrConfidence: 'high',
      effort: 'small',
      relatedIssues: [],
      labels: issue.labels.nodes.map(label => label.name),
      issue,
    };
  }

  function fakeClient(issue, rereads = []) {
    const reads = [...rereads];
    const calls = { transitions: [], labels: [], comments: [], rereads: 0 };
    return {
      calls,
      async fetchIssue() {
        calls.rereads += 1;
        return reads.shift() || issue;
      },
      async transitionIssue(id, stateId) {
        calls.transitions.push({ id, stateId });
        return { issueUpdate: { success: true } };
      },
      async fetchTeamLabel() {
        return { id: 'symphony-label-id', name: 'symphony' };
      },
      async setIssueLabels(id, labelIds) {
        calls.labels.push({ id, labelIds });
        return { issueUpdate: { success: true } };
      },
      async addComment(id, body) {
        calls.comments.push({ id, body });
        return { commentCreate: { success: true } };
      },
    };
  }

  function fleetEvidence(overrides = {}) {
    return {
      main: {
        status: 'green',
        sha: 'a3eeefdd4dc681d1c9b5b4385720d661f5129137',
      },
      production: {
        status: 'green',
        deployedSha: 'a3eeefdd4dc681d1c9b5b4385720d661f5129137',
      },
      controller: { status: 'green' },
      integrity: { status: 'clear' },
      queue: {
        status: 'known',
        eligiblePrs: 6,
        greenReadyPrs: 1,
        target: 15,
      },
      observedAt: '2026-08-09T05:00:00.000Z',
      ...overrides,
    };
  }

  function greenFleetGate() {
    return admitter.evaluateFleetGate(fleetEvidence(), {
      now: '2026-08-09T05:01:00.000Z',
    });
  }

  it('backpressures only at fifteen green ready-to-merge PRs', () => {
    const fleetGate = admitter.evaluateFleetGate(
      fleetEvidence({
        queue: {
          status: 'known',
          eligiblePrs: 40,
          greenReadyPrs: 15,
          target: 15,
        },
      }),
      { now: '2026-08-09T05:01:00.000Z' }
    );

    assert.equal(fleetGate.state, 'GREEN');
    assert.equal(fleetGate.promotionAdmission.allowed, true);
    assert.equal(fleetGate.workAdmission.newIssueLeaseAllowed, false);
    assert.equal(
      fleetGate.reasons.some(reason => reason.code === 'queue-above-target'),
      false
    );
    const oneLanded = admitter.evaluateFleetGate(
      fleetEvidence({
        queue: {
          status: 'known',
          eligiblePrs: 39,
          greenReadyPrs: 14,
          target: 15,
        },
      }),
      { now: '2026-08-09T05:01:00.000Z' }
    );
    assert.equal(oneLanded.workAdmission.newIssueLeaseAllowed, true);
  });

  it('continues new isolated leases when healthy production is behind exact main', async () => {
    const fleetGate = admitter.evaluateFleetGate(
      fleetEvidence({
        production: { status: 'green', deployedSha: 'bda0d88' },
      }),
      { now: '2026-08-09T05:01:00.000Z' }
    );
    const issue = admissionIssue({ identifier: 'JOV-4899' });
    const result = await admitter.selectNextToAdmit(
      [classification(issue)],
      [],
      { currentlyShipping: 0, fleetGate }
    );

    assert.equal(fleetGate.state, 'AMBER');
    assert.equal(fleetGate.promotionMode, 'hold-intake');
    assert.deepEqual(fleetGate.alreadyAdmittedCohort, {
      preserve: true,
      newIntakeAllowed: true,
      semantics: 'preserve-cohort-and-continue-isolated-implementation',
    });
    assert.equal(fleetGate.promotionAdmission.allowed, false);
    assert.equal(fleetGate.workAdmission.newIssueLeaseAllowed, true);
    assert.ok(
      fleetGate.reasons.some(
        reason => reason.code === 'production-deployment-unbound'
      )
    );
    assert.equal(result.admit.length, 1);
  });

  it('never binds a different full commit that shares the display prefix', () => {
    const fleetGate = admitter.evaluateFleetGate(
      fleetEvidence({
        production: {
          status: 'green',
          deployedSha: 'a3eeefdfffffffffffffffffffffffffffffffff',
        },
      }),
      { now: '2026-08-09T05:01:00.000Z' }
    );

    assert.equal(fleetGate.state, 'AMBER');
    assert.equal(fleetGate.promotionMode, 'hold-intake');
    assert.equal(fleetGate.promotionAdmission.allowed, false);
    assert.equal(fleetGate.workAdmission.newIssueLeaseAllowed, true);
  });

  it('blocks already-admitted cohort preservation when unbound production has extra amber reasons', () => {
    const fleetGate = admitter.evaluateFleetGate(
      fleetEvidence({
        production: { status: 'green', deployedSha: 'bda0d88' },
        queue: { status: 'known' },
      }),
      { now: '2026-08-09T05:01:00.000Z' }
    );

    assert.equal(fleetGate.state, 'AMBER');
    assert.equal(fleetGate.promotionMode, 'blocked');
    assert.equal(fleetGate.alreadyAdmittedCohort.preserve, false);
  });

  it('wires persisted main and deployment identities into lease admission', async () => {
    const source = await readFile(
      resolve(ORCHESTRATOR_DIR, 'backlog-orchestrator.mjs'),
      'utf8'
    );

    assert.match(source, /sha: receipt\?\.signals\?\.main\?\.sha/);
    assert.match(
      source,
      /deployedSha: receipt\?\.signals\?\.production\?\.deployedSha/
    );
  });

  it('treats main-red as draft-only AMBER while continuing new issue pickup', async () => {
    const now = '2026-08-09T05:01:00.000Z';
    const fleetGate = admitter.evaluateFleetGate(
      fleetEvidence({ main: { status: 'red' } }),
      { now }
    );
    const issue = admissionIssue({ identifier: 'JOV-4900' });
    const result = await admitter.selectNextToAdmit(
      [classification(issue)],
      [],
      { currentlyShipping: 0, fleetGate }
    );

    assert.equal(fleetGate.state, 'AMBER');
    assert.equal(fleetGate.promotionMode, 'draft-only');
    assert.equal(fleetGate.workAdmission.allowed, true);
    assert.equal(fleetGate.workAdmission.newIssueLeaseAllowed, true);
    assert.equal(fleetGate.promotionAdmission.allowed, false);
    assert.equal(fleetGate.isolatedPromotionAdmission.allowed, false);
    assert.equal(result.admit.length, 1);
  });

  it('permits only isolated queue promotion when production is red and main is green', () => {
    const fleetGate = admitter.evaluateFleetGate(
      fleetEvidence({ production: { status: 'red' } }),
      { now: '2026-08-09T05:01:00.000Z' }
    );

    assert.equal(fleetGate.state, 'AMBER');
    assert.equal(fleetGate.promotionMode, 'isolated-only');
    assert.equal(fleetGate.workAdmission.allowed, true);
    assert.equal(fleetGate.workAdmission.newIssueLeaseAllowed, true);
    assert.equal(fleetGate.promotionAdmission.allowed, false);
    assert.deepEqual(fleetGate.isolatedPromotionAdmission, {
      allowed: true,
      activities: ['ready-for-merge', 'native-merge-queue', 'merge'],
      deploymentsAllowed: false,
      scope: 'exact-head-semantically-isolated-ui-docs',
      maxConcurrent: 1,
      authority: 'canonical-merge-queue-controller',
    });
  });

  it('denies the isolated lane when integrity, controller, queue, or production evidence is ambiguous', () => {
    const cases = [
      fleetEvidence({ production: { status: 'unknown' } }),
      fleetEvidence({
        production: { status: 'red' },
        controller: { status: 'failed' },
      }),
      fleetEvidence({
        production: { status: 'red' },
        queue: { status: 'unknown' },
      }),
      fleetEvidence({ production: { status: 'red' }, integrity: {} }),
    ];

    for (const evidence of cases) {
      const fleetGate = admitter.evaluateFleetGate(evidence, {
        now: '2026-08-09T05:01:00.000Z',
      });
      assert.equal(fleetGate.isolatedPromotionAdmission.allowed, false);
      assert.equal(fleetGate.promotionAdmission.allowed, false);
    }
  });

  it('blocks pickup only for an explicit severe integrity failure', async () => {
    const fleetGate = admitter.evaluateFleetGate(
      fleetEvidence({
        integrity: {
          status: 'active',
          reason: 'broken-worktree-isolation',
          detail: 'branch writes crossed workspace boundaries',
        },
      }),
      { now: '2026-08-09T05:01:00.000Z' }
    );
    const issue = admissionIssue({ identifier: 'JOV-4901' });
    const result = await admitter.selectNextToAdmit(
      [classification(issue)],
      [],
      { currentlyShipping: 0, fleetGate }
    );

    assert.equal(fleetGate.state, 'RED');
    assert.equal(fleetGate.workAdmission.allowed, false);
    assert.equal(fleetGate.promotionAdmission.allowed, false);
    assert.equal(result.admit.length, 0);
    assert.match(result.reason, /blocking new issue pickup/);
  });

  it('fails closed at the integrity layer and only at promotion for malformed queue evidence', () => {
    const now = '2026-08-09T05:01:00.000Z';
    const invalidIntegrity = admitter.evaluateFleetGate(
      fleetEvidence({ integrity: {} }),
      { now }
    );
    const invalidQueue = admitter.evaluateFleetGate(
      fleetEvidence({ queue: { status: 'known' } }),
      { now }
    );

    assert.equal(invalidIntegrity.state, 'RED');
    assert.equal(invalidIntegrity.workAdmission.allowed, false);
    assert.ok(
      invalidIntegrity.reasons.some(
        reason => reason.code === 'invalid-integrity-receipt'
      )
    );
    assert.equal(invalidQueue.state, 'AMBER');
    assert.equal(invalidQueue.workAdmission.allowed, true);
    assert.equal(invalidQueue.workAdmission.newIssueLeaseAllowed, true);
    assert.equal(invalidQueue.promotionAdmission.allowed, false);
    assert.ok(
      invalidQueue.reasons.some(reason => reason.code === 'queue-unknown')
    );
  });

  it('recovers AMBER to GREEN and degrades stale controller state without stranding work', () => {
    const now = '2026-08-09T05:20:00.000Z';
    const amber = admitter.evaluateFleetGate(
      fleetEvidence({ main: { status: 'red' } }),
      { now: '2026-08-09T05:01:00.000Z' }
    );
    const green = admitter.evaluateFleetGate(fleetEvidence(), {
      now: '2026-08-09T05:01:00.000Z',
    });
    const stale = admitter.evaluateFleetGate(fleetEvidence(), { now });

    assert.equal(amber.state, 'AMBER');
    assert.equal(green.state, 'GREEN');
    assert.equal(green.workAdmission.allowed, true);
    assert.equal(green.promotionAdmission.allowed, true);
    assert.equal(stale.state, 'AMBER');
    assert.equal(stale.workAdmission.allowed, true);
    assert.equal(stale.promotionAdmission.allowed, false);
    assert.ok(stale.reasons.some(reason => reason.code === 'controller-stale'));
  });

  it('keeps Gem at four unless recent clean evidence explicitly proves eight', () => {
    const now = '2026-08-09T05:01:00.000Z';
    const approved = {
      schema: admitter.GEM_CONCURRENCY_EVIDENCE_SCHEMA,
      target: 8,
      approved: true,
      cleanRuns: 20,
      severeIncidents: 0,
      observedAt: '2026-08-09T05:00:00.000Z',
    };
    assert.equal(
      admitter.resolveGemConcurrency(null, { now }).maxConcurrent,
      4
    );
    assert.equal(
      admitter.resolveGemConcurrency({ ...approved, cleanRuns: 19 }, { now })
        .maxConcurrent,
      4
    );
    assert.equal(
      admitter.resolveGemConcurrency(approved, { now }).maxConcurrent,
      8
    );
  });

  it('versions the Gem controller and mechanically holds AMBER drafts from promotion', async () => {
    const controller = resolve(
      ORCHESTRATOR_DIR,
      '../hermes/gem-priority-gate.py'
    );
    const workflow = resolve(
      ORCHESTRATOR_DIR,
      '../hermes/WORKFLOW.jovie-ui-pilot.md'
    );
    const runController = async (signals, consumer = 'fleet') => {
      try {
        const { stdout } = await execFileAsync(
          'python3',
          [
            controller,
            '--evaluate-json',
            JSON.stringify(signals),
            '--consumer',
            consumer,
          ],
          { env: process.env }
        );
        return { exitCode: 0, receipt: JSON.parse(stdout) };
      } catch (error) {
        return {
          exitCode: error.code,
          receipt: JSON.parse(error.stdout),
        };
      }
    };
    const amber = await runController(
      fleetEvidence({
        main: { status: 'red', failedChecks: ['Production Synthetic Tests'] },
      })
    );
    const amberPromotion = await runController(
      fleetEvidence({
        main: { status: 'red', failedChecks: ['Production Synthetic Tests'] },
      }),
      'promotion'
    );
    const controllerFailure = await runController(
      fleetEvidence({ controller: { status: 'failed' } })
    );
    const severe = await runController(
      fleetEvidence({
        integrity: {
          status: 'active',
          reason: 'repository-or-artifact-corruption',
        },
      })
    );
    const missingIntegritySignals = fleetEvidence();
    delete missingIntegritySignals.integrity;
    const invalidIntegrity = await runController(missingIntegritySignals);
    const invalidQueue = await runController(
      fleetEvidence({ queue: { status: 'known' } })
    );
    const recovered = await runController(
      fleetEvidence({
        integrity: {
          status: 'resolved',
          reason: 'repository-or-artifact-corruption',
        },
      }),
      'promotion'
    );
    const workflowSource = await readFile(workflow, 'utf8');

    assert.equal(amber.exitCode, 0);
    assert.equal(amber.receipt.state, 'AMBER');
    assert.equal(amber.receipt.workAdmission.allowed, true);
    assert.equal(amber.receipt.workAdmission.newIssueLeaseAllowed, true);
    assert.equal(amber.receipt.promotionAdmission.allowed, false);
    assert.equal(amber.receipt.isolatedPromotionAdmission.allowed, false);
    assert.equal(amber.receipt.ownership.directGemPickup, false);
    assert.equal(amberPromotion.exitCode, 2);
    assert.equal(amberPromotion.receipt.state, 'AMBER');
    assert.equal(amberPromotion.receipt.workAdmission.allowed, true);
    assert.equal(amberPromotion.receipt.promotionAdmission.allowed, false);
    assert.equal(controllerFailure.receipt.state, 'AMBER');
    assert.equal(controllerFailure.receipt.workAdmission.allowed, true);
    assert.equal(controllerFailure.receipt.promotionAdmission.allowed, false);
    assert.equal(severe.exitCode, 2);
    assert.equal(severe.receipt.state, 'RED');
    assert.equal(severe.receipt.workAdmission.allowed, false);
    assert.equal(invalidIntegrity.exitCode, 2);
    assert.equal(invalidIntegrity.receipt.state, 'RED');
    assert.ok(
      invalidIntegrity.receipt.reasons.some(
        reason => reason.code === 'invalid-integrity-receipt'
      )
    );
    assert.equal(invalidQueue.exitCode, 0);
    assert.equal(invalidQueue.receipt.state, 'AMBER');
    assert.equal(invalidQueue.receipt.workAdmission.allowed, true);
    assert.equal(invalidQueue.receipt.promotionAdmission.allowed, false);
    assert.equal(recovered.exitCode, 0);
    assert.equal(recovered.receipt.state, 'GREEN');
    assert.equal(recovered.receipt.promotionAdmission.allowed, true);
    const productionRed = await runController(
      fleetEvidence({ production: { status: 'red' } })
    );
    assert.equal(productionRed.receipt.state, 'AMBER');
    assert.equal(productionRed.receipt.promotionAdmission.allowed, false);
    assert.equal(
      productionRed.receipt.isolatedPromotionAdmission.allowed,
      true
    );
    assert.equal(
      productionRed.receipt.isolatedPromotionAdmission.deploymentsAllowed,
      false
    );
    assert.match(workflowSource, /Always open a non-draft PR/);
    assert.match(workflowSource, /Do not create draft PRs/);
    assert.match(workflowSource, /including when the gate is `GREEN`/);
    assert.match(workflowSource, /gh pr edit --add-label queue-deferred/);
    assert.match(
      workflowSource,
      /fresh `GREEN` receipt or the exact isolated exception/
    );
    assert.match(
      workflowSource,
      /Labels and path-only classification are not eligibility evidence/
    );
    assert.match(workflowSource, /max_concurrent_agents: 4/);
    assert.doesNotMatch(workflowSource, /Open a non-draft PR/);
  });

  it('stops and never redispatches an agent once its issue reaches In Review', async () => {
    const workflow = resolve(
      ORCHESTRATOR_DIR,
      '../hermes/WORKFLOW.jovie-ui-pilot.md'
    );
    const workflowSource = await readFile(workflow, 'utf8');
    const frontmatter = workflowSource.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(frontmatter, 'workflow frontmatter missing');
    const activeStatesBlock = frontmatter[1].match(
      /^ {2}active_states:\n((?: {4}- .+\n?)+)/m
    );
    assert.ok(activeStatesBlock, 'tracker.active_states missing');
    const activeStates = [
      ...activeStatesBlock[1].matchAll(/^ {4}- (.+)$/gm),
    ].map(item => item[1].trim());

    // Symphony only leases and dispatches issues whose Linear state is listed
    // in tracker.active_states. With In Review absent, transitioning an issue
    // to In Review makes it undispatchable: the runtime stops the lane's
    // continuation turns, the implementation slot is released, and the issue
    // is never redispatched (verified in production on 2026-08-11: active
    // leases fell 4 -> 1 within one poll while the draft PRs stayed put).
    assert.deepEqual(activeStates, ['Todo', 'In Progress']);
    assert.ok(!activeStates.includes('In Review'));

    // Capacity and lease invariants are preserved: four concurrent agents,
    // each bound to one issue and one workspace.
    assert.match(workflowSource, /max_concurrent_agents: 4/);

    // The ownership boundary is documented: Symphony implements through
    // draft PR / In Review; Gem + GitHub own review, fleet-gate promotion,
    // queue, merge, deploy, and receipts, and keep the PR externally
    // monitorable without holding a Symphony slot.
    assert.match(
      workflowSource,
      /Gem \+ GitHub own everything after that point: review,/
    );
    assert.match(workflowSource, /externally monitorable/);
  });

  it('keeps the Gem drain on typed fleet admission and fail-closes exit-code mismatches', async () => {
    const hermesDir = resolve(ORCHESTRATOR_DIR, '../hermes');
    const consumer = await readFile(
      resolve(hermesDir, 'gem-pr-drain.py'),
      'utf8'
    );
    const contractProbe = `
import json
import pathlib
import sys
sys.path.insert(0, sys.argv[1])
from gem_gate_contract import GateContractError, drain_state_dir, gate_state_dir, validate_gate_result

receipt = {
    "schema": "jovie-fleet-gate/v1",
    "state": "AMBER",
    "signals": {"main": {"status": "red"}},
    "reasons": [{"code": "main-not-green", "layer": "promotion", "severity": "warning", "detail": "main red"}],
    "workAdmission": {"allowed": True},
    "promotionAdmission": {"allowed": False},
    "remediationAdmission": {
        "allowed": True,
        "localAllowed": True,
        "pushAllowed": True,
        "maxConcurrent": 1,
        "authority": "single-pr-writer-exact-head",
    },
    "ownership": {"directGemPickup": False},
}
validate_gate_result(0, json.dumps(receipt), "fleet")
validate_gate_result(0, json.dumps(receipt), "remediation")
validate_gate_result(2, json.dumps(receipt), "promotion")
try:
    validate_gate_result(0, json.dumps(receipt), "promotion")
except GateContractError:
    pass
else:
    raise AssertionError("promotion exit 0 must fail when typed admission is false")
assert gate_state_dir(pathlib.Path("/tmp/gem"), "JovieInc/Jovie") == pathlib.Path("/tmp/gem/state/gem-priority-gate")
assert gate_state_dir(pathlib.Path("/tmp/gem"), "other/repo") != pathlib.Path("/tmp/gem/state/gem-priority-gate")
assert gate_state_dir(pathlib.Path("/tmp/gem"), "other/repo").parent == pathlib.Path("/tmp/gem/state")
assert gate_state_dir(pathlib.Path("/tmp/gem"), "foo/bar-baz") != gate_state_dir(pathlib.Path("/tmp/gem"), "foo-bar/baz")
assert drain_state_dir(pathlib.Path("/tmp/gem"), "JovieInc/Jovie") == pathlib.Path("/tmp/gem/state/gem-pr-drain")
assert drain_state_dir(pathlib.Path("/tmp/gem"), "other/repo") != pathlib.Path("/tmp/gem/state/gem-pr-drain")
contradictory = dict(receipt, state="RED")
try:
    validate_gate_result(0, json.dumps(contradictory), "fleet")
except GateContractError:
    pass
else:
    raise AssertionError("RED plus work allowed must fail closed")
for invalid in (0, True, None):
    malformed = json.loads(json.dumps(receipt))
    malformed["remediationAdmission"]["maxConcurrent"] = invalid
    try:
        validate_gate_result(0, json.dumps(malformed), "remediation")
    except GateContractError:
        pass
    else:
        raise AssertionError("invalid remediation concurrency must fail closed")
malformed = json.loads(json.dumps(receipt))
malformed["remediationAdmission"]["authority"] = "descriptive-only"
try:
    validate_gate_result(0, json.dumps(malformed), "remediation")
except GateContractError:
    pass
else:
    raise AssertionError("invalid remediation authority must fail closed")
`;

    await execFileAsync('python3', ['-c', contractProbe, hermesDir]);
    assert.match(consumer, /"--consumer",\s*"remediation"/);
    assert.match(
      consumer,
      /validate_gate_result\(gate\.returncode, gate\.stdout, "remediation"\)/
    );
    assert.ok(
      consumer.indexOf('if not gate["remediationAdmission"]["localAllowed"]') <
        consumer.indexOf('authenticated, reason = auth_status()')
    );

    const workspace = await mkdtemp('/tmp/jovie-gem-drain-red-');
    await mkdir(resolve(workspace, 'scripts'), { recursive: true });
    await writeFile(
      resolve(workspace, 'gem_repo_registry.py'),
      `class Policy:
    pr_drain = True
    repo_class = "test"
    default_branch = "main"
def by_github(_repo):
    return Policy()
`
    );
    await writeFile(
      resolve(workspace, 'scripts/gem-priority-gate.py'),
      `import json
receipt = {
    "schema": "jovie-fleet-gate/v1",
    "state": "RED",
    "signals": {"main": {"status": "red"}},
    "reasons": [{"code": "repository-or-artifact-corruption", "layer": "integrity", "severity": "critical", "detail": "test"}],
    "workAdmission": {"allowed": False},
    "promotionAdmission": {"allowed": False},
    "remediationAdmission": {
        "allowed": True,
        "localAllowed": True,
        "pushAllowed": False,
        "maxConcurrent": 1,
        "authority": "single-pr-writer-exact-head",
    },
    "ownership": {"directGemPickup": False},
}
print(json.dumps(receipt))
raise SystemExit(0)
`
    );
    const updateProbe = `
import importlib.util
import json
import pathlib
import sys
consumer = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("gem_pr_drain", consumer)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
result = module.update_one({
    "number": 1,
    "mergeable_state": "behind",
    "head": {"ref": "test", "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
    "labels": [],
    "statusCheckRollup": [],
})
print(json.dumps(result))
`;
    const update = await execFileAsync(
      'python3',
      ['-c', updateProbe, resolve(hermesDir, 'gem-pr-drain.py')],
      {
        env: {
          ...process.env,
          GEM_WORKSPACE: workspace,
          GEM_PR_DRAIN_REPO: 'JovieInc/Jovie',
          PYTHONPATH: workspace,
        },
      }
    );
    const updateResult = JSON.parse(update.stdout);
    assert.equal(updateResult.action, 'work_admission_blocked');
    assert.equal(updateResult.result, 'skipped');

    await writeFile(
      resolve(workspace, 'scripts/gem-priority-gate.py'),
      `import json
receipt = {
    "schema": "jovie-fleet-gate/v1",
    "state": "AMBER",
    "signals": {"main": {"status": "red"}},
    "reasons": [{"code": "main-not-green", "layer": "promotion", "severity": "warning", "detail": "test"}],
    "workAdmission": {"allowed": True},
    "promotionAdmission": {"allowed": False},
    "remediationAdmission": {
        "allowed": True,
        "localAllowed": True,
        "pushAllowed": True,
        "maxConcurrent": 1,
        "authority": "single-pr-writer-exact-head",
    },
    "ownership": {"directGemPickup": False},
}
print(json.dumps(receipt))
raise SystemExit(0)
`
    );
    const allowedProbe = `
import importlib.util
import json
import pathlib
import sys
consumer = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("gem_pr_drain", consumer)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
calls = []
def fake_run(*args, **kwargs):
    calls.append(args)
    return "{}"
module.run = fake_run
behind = module.update_one({
    "number": 1,
    "mergeable_state": "behind",
    "head": {"ref": "test", "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
    "labels": [],
    "statusCheckRollup": [],
})
clean = module.update_one({
    "number": 2,
    "mergeable_state": "clean",
    "head": {"ref": "test-2", "sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
    "labels": [],
    "statusCheckRollup": [],
})
print(json.dumps({"behind": behind, "clean": clean, "calls": calls}))
`;
    const allowed = await execFileAsync(
      'python3',
      ['-c', allowedProbe, resolve(hermesDir, 'gem-pr-drain.py')],
      {
        env: {
          ...process.env,
          GEM_WORKSPACE: workspace,
          GEM_PR_DRAIN_REPO: 'JovieInc/Jovie',
          PYTHONPATH: workspace,
        },
      }
    );
    const allowedResult = JSON.parse(allowed.stdout);
    assert.equal(allowedResult.behind.action, 'api_update_branch');
    assert.equal(allowedResult.behind.result, 'ok');
    assert.ok(
      allowedResult.calls[0].includes(
        'expected_head_sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      )
    );
    assert.equal(allowedResult.clean.action, 'observe_only');
    assert.equal(
      allowedResult.clean.reason,
      'classified_for_bounded_rehabilitation'
    );
  });

  it('runs stale-lease recovery before gate-next admission preflight', async () => {
    const source = await readFile(
      resolve(ORCHESTRATOR_DIR, 'backlog-orchestrator.mjs'),
      'utf8'
    );
    const start = source.indexOf('async function runTeamGateNext');
    const end = source.indexOf('async function runAudit', start);
    const body = source.slice(start, end);
    assert.ok(start >= 0 && end > start);
    assert.ok(
      body.indexOf('recoverStaleLeases') < body.indexOf('admissionPreflight')
    );
  });

  it('rejects synthetic workstream bundles and admits no member', async () => {
    const real = admissionIssue({ identifier: 'JOV-4513' });
    const result = await admitter.selectNextToAdmit(
      [classification(real)],
      [
        {
          id: 'unknown-bundle-931',
          name: 'unknown cleanup bundle',
          issueIds: ['JOV-4513'],
        },
      ],
      { currentlyShipping: 0, fleetGate: greenFleetGate() }
    );
    assert.equal(result.admit.length, 0);
    assert.match(result.reason, /synthetic|no eligible/i);
  });

  it('does not impose a standing lease cap on active implementation', async () => {
    const issue = admissionIssue({ identifier: 'JOV-4580' });
    const noLeases = await admitter.selectNextToAdmit(
      [classification(issue)],
      [],
      { currentlyShipping: 0, fleetGate: greenFleetGate() }
    );
    const oneLease = await admitter.selectNextToAdmit(
      [classification(issue)],
      [],
      { currentlyShipping: 1, fleetGate: greenFleetGate() }
    );
    assert.equal(noLeases.admit.length, 1);
    assert.equal(oneLease.admit.length, 1);
  });

  it('selects exactly one concrete eligible JOV issue deterministically', async () => {
    const first = admissionIssue({
      identifier: 'JOV-4513',
      title: 'Fix crash',
    });
    const second = admissionIssue({
      identifier: 'JOV-4396',
      title: 'Fix typo',
    });
    const result = await admitter.selectNextToAdmit(
      [classification(first), classification(second)],
      [],
      { currentlyShipping: 0, fleetGate: greenFleetGate() }
    );
    assert.equal(result.admit.length, 1);
    assert.equal(result.admit[0].identifier, 'JOV-4396');
    assert.equal(result.admit[0].type, 'issue');
  });

  it('excludes protected and Tim-owned issues', async () => {
    const protectedIssue = admissionIssue({
      identifier: 'JOV-4513',
      labels: ['plan-approved', 'admission-approved', 'needs-human'],
    });
    const timOwned = admissionIssue({
      identifier: 'JOV-4396',
      assignee: { id: 'tim', name: 'Tim White' },
    });
    const result = await admitter.selectNextToAdmit(
      [classification(protectedIssue), classification(timOwned)],
      [],
      { currentlyShipping: 0, fleetGate: greenFleetGate() }
    );
    assert.equal(result.admit.length, 0);
  });

  it('fails closed when the canonical fleet gate is unavailable', async () => {
    const issue = admissionIssue({ identifier: 'JOV-4580' });
    const result = await admitter.selectNextToAdmit(
      [classification(issue)],
      [],
      { currentlyShipping: 0 }
    );

    assert.deepEqual(result.admit, []);
    assert.equal(
      result.reason,
      'fleet gate unavailable — blocking new issue pickup'
    );
    assert.equal(result.fleetGate, null);
  });

  it('records an idempotent lease receipt without duplicate mutations', async () => {
    const issue = admissionIssue({
      state: 'Todo',
      labels: ['plan-approved', 'admission-approved', 'symphony'],
    });
    issue.comments.nodes.push(routingComment(issue));
    issue.comments.nodes.push({
      body: admitter.buildAdmissionReceipt(issue, {
        now: '2026-07-29T00:00:00.000Z',
      }),
      createdAt: '2026-07-29T00:00:00.000Z',
    });
    const client = fakeClient(issue);
    const result = await admitter.admitIssue({
      issue,
      classification: classification(issue),
      client,
      now: '2026-07-29T00:00:00.000Z',
    });
    assert.equal(result.status, 'already-admitted');
    assert.deepEqual(client.calls.transitions, []);
    assert.deepEqual(client.calls.labels, []);
    assert.deepEqual(client.calls.comments, []);
  });

  it('verifies state, labels, and receipt by reread after mutation', async () => {
    const issue = admissionIssue({
      state: 'Triage',
      labels: ['plan-approved', 'admission-approved'],
    });
    const afterTransition = admissionIssue({
      state: 'Todo',
      labels: ['plan-approved', 'admission-approved'],
    });
    const afterLabel = admissionIssue({
      state: 'Todo',
      labels: ['plan-approved', 'admission-approved', 'symphony'],
    });
    const afterReceipt = admissionIssue({
      state: 'Todo',
      labels: ['plan-approved', 'admission-approved', 'symphony'],
      comments: [
        {
          body: admitter.buildAdmissionReceipt(issue, {
            now: '2026-07-29T00:00:00.000Z',
          }),
          createdAt: '2026-07-29T00:00:00.000Z',
        },
      ],
    });
    issue.comments.nodes.push(routingComment(issue));
    afterTransition.comments.nodes.push(routingComment(afterTransition));
    afterLabel.comments.nodes.push(routingComment(afterLabel));
    afterReceipt.comments.nodes.push(routingComment(afterReceipt));
    const client = fakeClient(issue, [
      afterTransition,
      afterLabel,
      afterReceipt,
      afterReceipt,
    ]);
    const result = await admitter.admitIssue({
      issue,
      classification: classification(issue),
      client,
      now: '2026-07-29T00:00:00.000Z',
    });
    assert.equal(result.status, 'admitted');
    assert.equal(client.calls.transitions.length, 1);
    assert.equal(client.calls.labels.length, 1);
    assert.equal(client.calls.comments.length, 1);
    assert.equal(client.calls.rereads, 4);
  });
});
