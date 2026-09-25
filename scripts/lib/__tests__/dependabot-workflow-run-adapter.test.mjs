import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adaptDependabotWorkflowRunEvent,
  runDependabotWorkflowRunAdapterCli,
} from '../../dependabot-workflow-run-adapter.mjs';

const REPO = 'jovie/jovie';
const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const EVENT_PATH = '/runner/_work/_temp/event.json';
const OUTPUT_PATH = '/runner/_work/_temp/output';

/** @typedef {{full_name: string}} RepositoryFixture */
/** @typedef {{id: number, workflow_id: number, name: string, event: string, conclusion: string, head_sha: string, repository: RepositoryFixture, head_repository: RepositoryFixture, pull_requests: unknown[]}} WorkflowRunFixture */
/** @typedef {{action: string, repository: RepositoryFixture, sender: {login: string}, workflow_run: WorkflowRunFixture}} PayloadFixture */
/** @typedef {{number: number, html_url: string, state: string, draft: boolean, user: {login: string}, base: {ref: string, repo: RepositoryFixture}, head: {sha: string, ref: string, repo: RepositoryFixture}, labels: Array<{name: string}>}} PullRequestFixture */
/** @typedef {Partial<Omit<PullRequestFixture, 'labels'>> & {labels?: PullRequestFixture['labels'] | null}} PullRequestOverrides */
/** @typedef {{id: number, name: string, path: string, state: string}} WorkflowFixture */
/** @typedef {{payload?: PayloadFixture, rawPayload?: string, associated?: PullRequestFixture[] | null, associationLink?: string | null, workflow?: WorkflowFixture, workflowError?: boolean, associationError?: boolean, readError?: boolean, writeError?: boolean}} HarnessOptions */

/**
 * @param {Partial<PayloadFixture>} [overrides]
 * @returns {PayloadFixture}
 */
function makePayload(overrides = {}) {
  return {
    action: 'completed',
    repository: { full_name: REPO },
    sender: { login: 'github-actions[bot]' },
    workflow_run: {
      id: 100,
      workflow_id: 178737329,
      name: 'CI',
      event: 'pull_request',
      conclusion: 'success',
      head_sha: SHA,
      repository: { full_name: REPO },
      head_repository: { full_name: REPO },
      pull_requests: [],
    },
    ...overrides,
  };
}

/**
 * @param {PullRequestOverrides} [overrides]
 * @returns {PullRequestFixture}
 */
function makePullRequest(overrides = {}) {
  return {
    number: 42,
    html_url: `https://github.com/${REPO}/pull/42`,
    state: 'open',
    draft: false,
    user: { login: 'dependabot[bot]' },
    base: { ref: 'main', repo: { full_name: REPO } },
    head: {
      sha: SHA,
      ref: 'dependabot/npm/npm/example-1.2.0',
      repo: { full_name: REPO },
    },
    labels: [{ name: 'dependencies' }],
    ...overrides,
  };
}

/** @param {HarnessOptions} [options] */
function harness({
  payload = makePayload(),
  rawPayload,
  associated = [makePullRequest()],
  associationLink = null,
  workflow = {
    id: 178737329,
    name: 'CI',
    path: '.github/workflows/ci.yml',
    state: 'active',
  },
  workflowError,
  associationError,
  readError,
  writeError,
} = {}) {
  const writes = [];
  const outputs = [];
  const requests = [];
  const eventText = rawPayload ?? JSON.stringify(payload);
  const resultPromise = adaptDependabotWorkflowRunEvent(
    {
      eventPath: EVENT_PATH,
      repository: REPO,
      expectedHead: SHA,
      token: 'test-token',
      outputPath: OUTPUT_PATH,
    },
    {
      readFile(path) {
        assert.equal(path, EVENT_PATH);
        if (readError) throw new Error('read failed');
        return eventText;
      },
      writeFile(path, contents, encoding) {
        if (writeError) throw new Error('write failed');
        writes.push({ path, contents, encoding });
      },
      appendFile(path, contents, encoding) {
        outputs.push({ path, contents, encoding });
      },
      async request(path, options) {
        requests.push({ path, options });
        if (path.endsWith('/actions/workflows/178737329')) {
          if (workflowError) throw new Error('workflow read failed');
          return { data: workflow };
        }
        if (path.endsWith(`/commits/${SHA}/pulls?per_page=100`)) {
          if (associationError) throw new Error('association read failed');
          return { data: associated, link: associationLink };
        }
        throw new Error(`unexpected API path: ${path}`);
      },
    }
  );
  return { resultPromise, writes, outputs, requests };
}

/** @param {HarnessOptions} options @param {string} reason */
async function assertRejected(options, reason) {
  const h = harness(options);
  const result = await h.resultPromise;
  assert.deepEqual(result, { eligible: false, reason });
  assert.equal(h.writes.length, 0);
  assert.equal(h.outputs.length, 1);
  assert.match(
    h.outputs[0].contents,
    new RegExp(`eligible=false\\nreason=${reason}\\n`)
  );
  return h;
}

test('binds a successful canonical CI run to exactly one current Dependabot PR', async () => {
  const h = harness();
  const result = await h.resultPromise;
  assert.deepEqual(result, {
    eligible: true,
    reason: 'exact-dependabot-pull-request-bound',
    prNumber: 42,
    headSha: SHA,
    prUrl: `https://github.com/${REPO}/pull/42`,
  });
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].path, EVENT_PATH);
  assert.equal(h.writes[0].encoding, 'utf8');
  const adapted = JSON.parse(h.writes[0].contents);
  assert.deepEqual(adapted.workflow_run, makePayload().workflow_run);
  assert.deepEqual(adapted.sender, { login: 'github-actions[bot]' });
  assert.equal(adapted.pull_request.number, 42);
  assert.equal(adapted.pull_request.head.sha, SHA);
  assert.deepEqual(
    h.requests.map(request => request.path),
    [
      `/repos/${REPO}/actions/workflows/178737329`,
      `/repos/${REPO}/commits/${SHA}/pulls?per_page=100`,
    ]
  );
  assert.ok(
    h.requests.every(request => request.options.token === 'test-token')
  );
  assert.equal(h.outputs[0].path, OUTPUT_PATH);
  assert.match(h.outputs[0].contents, /pr_number=42\nhead_sha=/);
});

test('rejects a same-name run from a different workflow ID before API reads', async () => {
  const h = await assertRejected(
    {
      payload: makePayload({
        workflow_run: { ...makePayload().workflow_run, workflow_id: 999 },
      }),
    },
    'workflow-run-not-eligible'
  );
  assert.deepEqual(h.requests, []);
});

test('rejects another workflow name and non-success or non-pull-request events', async t => {
  /** @type {Array<[string, Partial<WorkflowRunFixture>]>} */
  const changes = [
    ['wrong name', { name: 'CI Copy' }],
    ['failed CI', { conclusion: 'failure' }],
    ['push CI', { event: 'push' }],
    ['wrong SHA', { head_sha: OTHER_SHA }],
  ];
  for (const [name, run] of changes) {
    await t.test(name, async () => {
      const payload = makePayload({
        workflow_run: { ...makePayload().workflow_run, ...run },
      });
      await assertRejected({ payload }, 'workflow-run-not-eligible');
    });
  }
});

test('rejects events from another repository or a forked run head', async t => {
  /** @type {Array<[string, Partial<PayloadFixture>, string]>} */
  const cases = [
    [
      'foreign event repository',
      { repository: { full_name: 'someone/else' } },
      'workflow-run-repository-mismatch',
    ],
    [
      'foreign source repository',
      {
        workflow_run: {
          ...makePayload().workflow_run,
          repository: { full_name: 'someone/else' },
        },
      },
      'workflow-run-repository-mismatch',
    ],
    [
      'fork workflow head',
      {
        workflow_run: {
          ...makePayload().workflow_run,
          head_repository: { full_name: 'contributor/jovie' },
        },
      },
      'workflow-run-repository-mismatch',
    ],
  ];
  for (const [name, change, reason] of cases) {
    await t.test(name, async () => {
      await assertRejected({ payload: makePayload(change) }, reason);
    });
  }
});

test('verifies canonical CI workflow ID, name, path, and active state by API', async t => {
  /** @type {WorkflowFixture[]} */
  const workflows = [
    { id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
    {
      id: 178737329,
      name: 'CI Copy',
      path: '.github/workflows/ci.yml',
      state: 'active',
    },
    {
      id: 178737329,
      name: 'CI',
      path: '.github/workflows/other.yml',
      state: 'active',
    },
    {
      id: 178737329,
      name: 'CI',
      path: '.github/workflows/ci.yml',
      state: 'disabled_manually',
    },
  ];
  for (const workflow of workflows) {
    await t.test(JSON.stringify(workflow), async () => {
      const h = await assertRejected(
        { workflow },
        'canonical-ci-workflow-mismatch'
      );
      assert.equal(h.requests.length, 1);
    });
  }
  const unavailable = await assertRejected(
    { workflowError: true },
    'canonical-ci-workflow-unavailable'
  );
  assert.equal(unavailable.requests.length, 1);
});

test('rejects unavailable, incomplete, empty, or ambiguous PR associations', async t => {
  /** @type {Array<[string, HarnessOptions, string]>} */
  const cases = [
    [
      'API unavailable',
      { associationError: true },
      'pull-request-association-unavailable',
    ],
    [
      'not an array',
      { associated: null },
      'pull-request-association-incomplete',
    ],
    [
      'incomplete pagination',
      { associationLink: '<https://api.github.com?page=2>; rel="next"' },
      'pull-request-association-incomplete',
    ],
    ['no PR', { associated: [] }, 'no-associated-pull-request'],
    [
      'multiple PRs',
      { associated: [makePullRequest(), makePullRequest({ number: 43 })] },
      'multiple-associated-pull-requests',
    ],
  ];
  for (const [name, options, reason] of cases) {
    await t.test(name, async () => {
      await assertRejected(options, reason);
    });
  }
});

test('requires the current open Dependabot main-branch head in the same repository', async t => {
  /** @type {Array<[string, PullRequestOverrides, string]>} */
  const cases = [
    ['invalid PR number', { number: 0 }, 'pull-request-identity-invalid'],
    [
      'other author',
      { user: { login: 'contributor' } },
      'author-not-dependabot',
    ],
    ['draft PR', { draft: true }, 'pull-request-not-open-ready'],
    ['closed PR', { state: 'closed' }, 'pull-request-not-open-ready'],
    [
      'wrong base',
      { base: { ref: 'release', repo: { full_name: REPO } } },
      'pull-request-base-mismatch',
    ],
    [
      'foreign base repository',
      { base: { ref: 'main', repo: { full_name: 'someone/else' } } },
      'pull-request-base-mismatch',
    ],
    [
      'fork head',
      {
        head: {
          sha: SHA,
          ref: 'branch',
          repo: { full_name: 'contributor/jovie' },
        },
      },
      'fork-head-not-eligible',
    ],
    [
      'stale head',
      { head: { sha: OTHER_SHA, ref: 'branch', repo: { full_name: REPO } } },
      'stale-head',
    ],
    ['missing evidence', { labels: null }, 'pull-request-evidence-incomplete'],
  ];
  for (const [name, change, reason] of cases) {
    await t.test(name, async () => {
      await assertRejected({ associated: [makePullRequest(change)] }, reason);
    });
  }
});

test('fails closed for malformed input, unavailable payload, and scratch-file errors', async t => {
  await t.test('invalid identity', async () => {
    const outputs = [];
    const result = await adaptDependabotWorkflowRunEvent(
      {
        eventPath: EVENT_PATH,
        repository: 'invalid',
        expectedHead: SHA,
        token: 'x',
        outputPath: OUTPUT_PATH,
      },
      {
        appendFile(path, contents) {
          outputs.push({ path, contents });
        },
      }
    );
    assert.deepEqual(result, {
      eligible: false,
      reason: 'workflow-run-identity-invalid',
    });
    assert.deepEqual(outputs, [
      {
        path: OUTPUT_PATH,
        contents: 'eligible=false\nreason=workflow-run-identity-invalid\n',
      },
    ]);
  });
  await t.test('unavailable event', async () => {
    await assertRejected(
      { readError: true },
      'workflow-run-payload-unavailable'
    );
  });
  await t.test('invalid event JSON', async () => {
    await assertRejected(
      { rawPayload: '{' },
      'workflow-run-payload-unavailable'
    );
  });
  await t.test('scratch event write', async () => {
    await assertRejected({ writeError: true }, 'event-adaptation-write-failed');
  });
});

test('uses the authenticated GitHub REST client when no request seam is supplied', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiUrl = process.env.GITHUB_API_URL;
  /** @type {Array<{url: string, init?: RequestInit}>} */
  const calls = [];
  const responses = [
    {
      id: 178737329,
      name: 'CI',
      path: '.github/workflows/ci.yml',
      state: 'active',
    },
    [makePullRequest()],
  ];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const data = responses.shift();
    return new Response(JSON.stringify(data), { status: 200 });
  };
  process.env.GITHUB_API_URL = 'https://api.github.test/';
  try {
    // Reuse the event/output fixtures but omit the injected request implementation.
    const result = await adaptDependabotWorkflowRunEvent(
      {
        eventPath: EVENT_PATH,
        repository: REPO,
        expectedHead: SHA,
        token: 'app-token',
        outputPath: OUTPUT_PATH,
      },
      {
        readFile: () => JSON.stringify(makePayload()),
        writeFile() {},
        appendFile() {},
      }
    );
    assert.equal(result.eligible, true);
    assert.equal(calls.length, 2);
    assert.equal(
      calls[0].url,
      'https://api.github.test/repos/jovie/jovie/actions/workflows/178737329'
    );
    assert.equal(
      calls[1].url,
      `https://api.github.test/repos/jovie/jovie/commits/${SHA}/pulls?per_page=100`
    );
    assert.equal(
      new Headers(calls[0].init?.headers).get('Authorization'),
      'Bearer app-token'
    );
    assert.equal(
      new Headers(calls[1].init?.headers).get('X-GitHub-Api-Version'),
      '2022-11-28'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiUrl === undefined) delete process.env.GITHUB_API_URL;
    else process.env.GITHUB_API_URL = originalApiUrl;
  }
});

test('fails closed when the authenticated REST client returns invalid JSON, HTTP errors, or network errors', async t => {
  const originalFetch = globalThis.fetch;
  const originalApiUrl = process.env.GITHUB_API_URL;
  process.env.GITHUB_API_URL = 'https://api.github.test';
  try {
    /** @type {Array<[string, typeof fetch]>} */
    const failingFetches = [
      ['invalid JSON', async () => new Response('{', { status: 200 })],
      [
        'HTTP error',
        async () => new Response('{"message":"forbidden"}', { status: 403 }),
      ],
      [
        'network error',
        async () => {
          throw new Error('network unavailable');
        },
      ],
    ];
    for (const [name, fetchImpl] of failingFetches) {
      await t.test(name, async () => {
        globalThis.fetch = fetchImpl;
        const outputs = [];
        const result = await adaptDependabotWorkflowRunEvent(
          {
            eventPath: EVENT_PATH,
            repository: REPO,
            expectedHead: SHA,
            token: 'token',
            outputPath: OUTPUT_PATH,
          },
          {
            readFile: () => JSON.stringify(makePayload()),
            appendFile: (path, contents) => outputs.push({ path, contents }),
          }
        );
        assert.deepEqual(result, {
          eligible: false,
          reason: 'canonical-ci-workflow-unavailable',
        });
        assert.match(
          outputs[0].contents,
          /eligible=false\nreason=canonical-ci-workflow-unavailable/
        );
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiUrl === undefined) delete process.env.GITHUB_API_URL;
    else process.env.GITHUB_API_URL = originalApiUrl;
  }
});

test('does not require a GitHub output file and runs its CLI logger only for the entry point', async () => {
  const originalOutputPath = process.env.GITHUB_OUTPUT;
  delete process.env.GITHUB_OUTPUT;
  try {
    let writes = 0;
    const result = await adaptDependabotWorkflowRunEvent(
      {
        eventPath: EVENT_PATH,
        repository: 'invalid',
        expectedHead: SHA,
        token: 'token',
      },
      { readFile: () => '{}', appendFile: () => writes++ }
    );
    assert.equal(result.eligible, false);
    assert.equal(writes, 0);
  } finally {
    if (originalOutputPath === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = originalOutputPath;
  }

  const logs = [];
  await runDependabotWorkflowRunAdapterCli({
    isEntryPoint: true,
    adapt: async () => ({ eligible: false, reason: 'test' }),
    log: value => logs.push(value),
  });
  await runDependabotWorkflowRunAdapterCli({
    isEntryPoint: false,
    adapt: async () => {
      throw new Error('must not execute');
    },
    log: () => {
      throw new Error('must not log');
    },
  });
  assert.deepEqual(logs, ['{"eligible":false,"reason":"test"}']);
});
