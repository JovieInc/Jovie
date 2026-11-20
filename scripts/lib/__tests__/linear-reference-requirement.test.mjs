import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateLinearReference,
  extractLinearReferences,
  linearReferenceFix,
  lookupLinearIssues,
} from '../linear-reference-requirement.mjs';

const policy = (mode = 'enforce') => ({
  mode,
  teams: ['JOV', 'LYB', 'SYM'],
  exempt: [
    {
      author: 'dependabot[bot]',
      reason: 'Dependency bumps are tracked by the advisory loop issue.',
    },
    {
      author: 'jovie-bot[bot]',
      branchPrefix: ['screenshots/auto-update'],
      reason:
        'Scheduled artifact refresh; the producing workflow is the tracked unit.',
    },
    { author: 'someone', reason: 'short' },
  ],
});
const live = {
  exists: true,
  state: 'In Progress',
  createdAt: '2026-11-01T00:00:00Z',
  title: 'Real work',
};

test('reads title, branch, Refs line and markers; ignores prose mentions', () => {
  const refs = extractLinearReferences({
    title: 'fix(x): thing (JOV-12)',
    headRef: 'codex/jov-34-thing',
    body: 'Mentions JOV-99 in prose.\nRefs LYB-5\n<!-- linear-issue-identifier: JOV-77 -->',
  });
  assert.deepEqual(refs.map(r => r.identifier).sort(), [
    'JOV-12',
    'JOV-34',
    'JOV-77',
    'LYB-5',
  ]);
});

test('empty template line "Refs JOV-" is not a reference', () => {
  assert.equal(
    extractLinearReferences({ title: 't', body: 'Refs JOV-\n' }).length,
    0
  );
});

test('missing reference blocks only in enforce mode', () => {
  const pr = {
    title: 'typo',
    body: '',
    headRef: 'fix/typo',
    author: 'itstimwhite',
  };
  assert.equal(
    evaluateLinearReference({ pr, policy: policy('enforce'), issues: {} })
      .allowed,
    false
  );
  const observed = evaluateLinearReference({
    pr,
    policy: policy('observe'),
    issues: {},
  });
  assert.equal(observed.allowed, true);
  assert.equal(observed.verdict, 'missing');
});

test('unknown or canceled issue fails in enforce mode', () => {
  const pr = { title: 'x JOV-1', body: '', headRef: 'b', author: 'a' };
  assert.equal(
    evaluateLinearReference({
      pr,
      policy: policy(),
      issues: { 'JOV-1': { exists: false } },
    }).verdict,
    'unknown-or-dead-issue'
  );
  assert.equal(
    evaluateLinearReference({
      pr,
      policy: policy(),
      issues: { 'JOV-1': { ...live, state: 'Canceled' } },
    }).allowed,
    false
  );
  assert.equal(
    evaluateLinearReference({ pr, policy: policy(), issues: { 'JOV-1': live } })
      .verdict,
    'linked'
  );
});

test('Linear outage never blocks (fail open, verified after merge)', () => {
  const pr = { title: 'x JOV-1', body: '', headRef: 'b', author: 'a' };
  const r = evaluateLinearReference({ pr, policy: policy(), issues: null });
  assert.equal(r.allowed, true);
  assert.equal(r.verdict, 'unverified');
});

test('exemptions need an author match, branch match and a real reason', () => {
  const dep = {
    title: 'bump',
    body: '',
    headRef: 'dependabot/npm/x',
    author: 'dependabot[bot]',
  };
  assert.equal(
    evaluateLinearReference({ pr: dep, policy: policy(), issues: {} }).verdict,
    'exempt'
  );
  const botOther = {
    title: 'feat',
    body: '',
    headRef: 'feature/x',
    author: 'jovie-bot[bot]',
  };
  assert.equal(
    evaluateLinearReference({ pr: botOther, policy: policy(), issues: {} })
      .allowed,
    false
  );
  const shortReason = { title: 'x', body: '', headRef: 'x', author: 'someone' };
  assert.equal(
    evaluateLinearReference({ pr: shortReason, policy: policy(), issues: {} })
      .allowed,
    false
  );
});

test('shell issue created after the PR is flagged but not blocked', () => {
  const pr = {
    title: 'x',
    body: 'Refs JOV-9',
    headRef: 'b',
    author: 'a',
    createdAt: '2026-11-19T10:00:00Z',
  };
  const r = evaluateLinearReference({
    pr,
    policy: policy(),
    issues: {
      'JOV-9': {
        exists: true,
        state: 'Todo',
        createdAt: '2026-11-19T10:05:00Z',
        title: 'PR #123',
      },
    },
  });
  assert.equal(r.allowed, true);
  assert.equal(r.verdict, 'linked-low-quality');
  assert.equal(linearReferenceFix(r), '');
  const missing = evaluateLinearReference({
    pr: { title: 'typo', body: '', headRef: 'fix/typo', author: 'a' },
    policy: policy('observe'),
    issues: {},
  });
  assert.match(linearReferenceFix(missing), /Refs JOV-123/);
});

process.env.JOVIE_API_STATE = 'memory';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('lookup batches one request through the shared client and maps not-found to exists:false', async () => {
  let calls = 0;
  const fetchImpl = async (input, init) => {
    calls += 1;
    const body = String(
      init?.body ?? (input instanceof Request ? await input.text() : '')
    );
    assert.match(body, /issue\(id: \\"JOV-1\\"\)/);
    assert.match(body, /issue\(id: \\"JOV-2\\"\)/);
    return jsonResponse({
      data: {
        k0: {
          identifier: 'JOV-1',
          title: 't',
          createdAt: 'c',
          state: { name: 'Todo' },
        },
        k1: null,
      },
      errors: [{ message: 'Entity not found: Issue' }],
    });
  };
  const out = await lookupLinearIssues(['JOV-1', 'JOV-2'], {
    apiKey: 'k-batch',
    fetchImpl,
    legacyStateRoot: null,
  });
  assert.equal(calls, 1);
  assert.deepEqual(out['JOV-2'], { exists: false });
  assert.equal(out['JOV-1'].state, 'Todo');
});

test('lookup returns null on outage and on missing key, {} for no identifiers', async () => {
  let called = false;
  assert.equal(
    await lookupLinearIssues(['JOV-1'], {
      apiKey: '',
      fetchImpl: async () => {
        called = true;
        return jsonResponse({});
      },
      legacyStateRoot: null,
    }),
    null
  );
  assert.equal(called, false);
  assert.deepEqual(await lookupLinearIssues([], { apiKey: '' }), {});
  assert.equal(
    await lookupLinearIssues(['JOV-1'], {
      apiKey: 'k-outage',
      fetchImpl: async () =>
        jsonResponse({ errors: [{ message: 'boom' }] }, 400),
      timeoutMs: 500,
      legacyStateRoot: null,
    }),
    null
  );
});
