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
      'stale-lease-guard.mjs',
    ]) {
      assert.match(
        executableSource,
        new RegExp(`from ['"]\\./${dependency}['"]`),
        `entrypoint must declare ${dependency} in its static dependency closure`
      );
    }
    assert.equal(JSON.parse(await readFile(config, 'utf8')).version, 1);
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
      { currentlyShipping: 0, productionRed: false }
    );
    assert.equal(result.admit.length, 0);
    assert.match(result.reason, /synthetic|no eligible/i);
  });

  it('admits with zero active leases and blocks with one active lease', async () => {
    const issue = admissionIssue({ identifier: 'JOV-4580' });
    const noLeases = await admitter.selectNextToAdmit(
      [classification(issue)],
      [],
      { currentlyShipping: 0, productionRed: false }
    );
    const oneLease = await admitter.selectNextToAdmit(
      [classification(issue)],
      [],
      { currentlyShipping: 1, productionRed: false }
    );
    assert.equal(noLeases.admit.length, 1);
    assert.equal(oneLease.admit.length, 0);
    assert.equal(oneLease.reason, 'at capacity (1/1)');
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
      { currentlyShipping: 0, productionRed: false }
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
      { currentlyShipping: 0, productionRed: false }
    );
    assert.equal(result.admit.length, 0);
  });

  it('records an idempotent lease receipt without duplicate mutations', async () => {
    const issue = admissionIssue({
      state: 'Todo',
      labels: ['plan-approved', 'admission-approved', 'symphony'],
    });
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
