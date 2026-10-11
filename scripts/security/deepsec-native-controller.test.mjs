import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import {
  main,
  nativeGithubStore,
  runNativeController,
} from './deepsec-native-controller.mjs';
import { emptyNativeLedger } from './deepsec-native-reconcile.mjs';
import {
  subscriptionPlan,
  subscriptionReceipt,
} from './deepsec-subscription.mjs';

const sha = 'a'.repeat(40),
  nextSha = 'b'.repeat(40),
  treeSha = 'c'.repeat(40);
const branch = 'codex/deepsec-native-ledger';
const ledgerPath = 'scripts/security/deepsec/native-ledger.json';
const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function apiFixture(existing = false) {
  const calls = [];
  let head = existing ? sha : null;
  let ledger = emptyNativeLedger();
  let comments = [];
  let override;
  const fetchImpl = async (url, options) => {
    const path = String(url).split('/JovieInc/Jovie/')[1];
    const method = options.method;
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, path, body });
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    assert.ok(options.signal instanceof AbortSignal);
    if (override) {
      const result = override({ method, path, body });
      if (result) return result;
    }
    let result;
    if (path === 'git/ref/heads/main')
      result = { ref: 'refs/heads/main', object: { sha } };
    else if (path === `git/ref/heads/${branch}`) {
      if (!head) return new Response('{}', { status: 404 });
      result = { ref: `refs/heads/${branch}`, object: { sha: head } };
    } else if (path.startsWith('contents/'))
      result = {
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(ledger)).toString('base64'),
      };
    else if (path.startsWith('git/commits/') && method === 'GET')
      result = { sha: head ?? sha, tree: { sha: treeSha } };
    else if (path === 'git/trees') {
      ledger = JSON.parse(body.tree[0].content);
      result = { sha: treeSha };
    } else if (path === 'git/commits') result = { sha: nextSha };
    else if (path === 'git/refs' || path === `git/refs/heads/${branch}`) {
      head = body.sha;
      result = { ref: `refs/heads/${branch}`, object: { sha: head } };
    } else if (path === 'pulls/123')
      result = {
        number: 123,
        state: 'open',
        base: { ref: 'main' },
        head: { sha, repo: { full_name: 'JovieInc/Jovie' } },
        labels: [],
      };
    else if (method === 'GET' && path.startsWith('issues/123/comments?'))
      result = comments;
    else if (
      path === 'issues/123/comments' ||
      path.startsWith('issues/comments/')
    )
      result = { id: 7, body: body.body };
    else throw new Error(`Unexpected fixture route ${method} ${path}`);
    return Response.json(result);
  };
  return {
    calls,
    store: nativeGithubStore({ token: 'fixture-token', fetchImpl }),
    setHead: value => {
      head = value;
    },
    setComments: value => {
      comments = value;
    },
    setOverride: value => {
      override = value;
    },
  };
}

test('new and existing ledger publication preserve parent and require ordinary fast forward', async () => {
  for (const existing of [false, true]) {
    const f = apiFixture(existing);
    const ledger = await f.store.loadLedger();
    ledger.runs.push('verified-native-run');
    const lease = () => f.store.sourceLease({ headSha: sha });
    await f.store.saveLedger(ledger, lease);
    await lease();
    const create = f.calls.find(call => call.path === 'git/commits');
    assert.deepEqual(create.body.parents, [sha]);
    const tree = f.calls.find(call => call.path === 'git/trees');
    assert.equal(tree.body.tree.length, 1);
    assert.equal(tree.body.tree[0].path, ledgerPath);
    const write = f.calls.find(call => call.path.startsWith('git/refs'));
    assert.equal(write.method, existing ? 'PATCH' : 'POST');
    if (existing) assert.equal(write.body.force, false);
    assert.deepEqual((await f.store.loadLedger()).runs, [
      'verified-native-run',
    ]);
  }
});

test('source, hold and ledger drift fail before publication', async () => {
  const f = apiFixture(true);
  await f.store.loadLedger();
  await f.store.sourceLease({ headSha: sha, prNumber: 123 });
  await assert.rejects(
    f.store.sourceLease({ headSha: nextSha }),
    /main source lease/
  );
  f.setOverride(call =>
    call.path === 'pulls/123'
      ? Response.json({
          number: 123,
          state: 'open',
          base: { ref: 'main' },
          head: { sha, repo: { full_name: 'JovieInc/Jovie' } },
          labels: [{ name: 'hold' }],
        })
      : null
  );
  await assert.rejects(
    f.store.sourceLease({ headSha: sha, prNumber: 123 }),
    /held/
  );
  f.setOverride(null);
  f.setHead(nextSha);
  await assert.rejects(
    f.store.saveLedger(emptyNativeLedger(), () =>
      f.store.sourceLease({ headSha: sha })
    ),
    /ledger lease/
  );
  assert.equal(
    f.calls.some(call => call.method !== 'GET'),
    false
  );
});

test('advisory update replaces only the canonical bot marker; user comments are preserved', async () => {
  const f = apiFixture();
  await f.store.loadLedger();
  const marker = '<!-- jovie-deepsec-native/v1 -->';
  f.setComments([{ id: 1, user: { login: 'user' }, body: marker }]);
  await f.store.writeComment(123, marker + '\nclean', () =>
    f.store.sourceLease({ headSha: sha, prNumber: 123 })
  );
  assert.equal(f.calls.at(-1).path, 'issues/123/comments');
  f.setComments([
    { id: 8, user: { login: 'jovie-bot[bot]' }, body: marker + '\nstale' },
  ]);
  await f.store.writeComment(123, marker + '\nclean', () =>
    f.store.sourceLease({ headSha: sha, prNumber: 123 })
  );
  assert.equal(f.calls.at(-1).path, 'issues/comments/8');
  f.setComments(
    [8, 9].map(id => ({ id, user: { login: 'jovie-bot[bot]' }, body: marker }))
  );
  await assert.rejects(
    f.store.writeComment(123, marker, async () => {}),
    /Ambiguous/
  );
  f.setComments(
    Array.from({ length: 100 }, (_, id) => ({ id, body: 'unrelated' }))
  );
  await assert.rejects(
    f.store.writeComment(123, marker, async () => {}),
    /incomplete/
  );
});

test('unknown HTTP outcomes, malformed identities and oversized bodies fail closed', async () => {
  assert.throws(() => nativeGithubStore({ token: '' }), /token/);
  for (const response of [
    new Response('{}', { status: 503 }),
    Response.json({ ref: 'wrong' }),
    new Response('x'.repeat(4 * 1024 * 1024 + 1)),
    new Response(null),
  ]) {
    const f = apiFixture();
    f.setOverride(() => response);
    await assert.rejects(f.store.loadLedger());
  }
  const f = apiFixture(true);
  f.setOverride(call =>
    call.path.startsWith('contents/')
      ? Response.json({ type: 'directory' })
      : null
  );
  await assert.rejects(f.store.loadLedger(), /ledger file/);
});

function sourceFixture() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'native-controller-test-'))
  );
  roots.push(root);
  const sourceRoot = join(root, 'source');
  mkdirSync(sourceRoot);
  const file = 'apps/web/lib/auth/require-auth.ts';
  mkdirSync(dirname(join(sourceRoot, file)), { recursive: true });
  writeFileSync(join(sourceRoot, file), 'export const guarded = true;\n');
  const git = args =>
    execFileSync('git', ['-C', sourceRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git(['init', '--quiet']);
  git(['remote', 'add', 'origin', 'https://github.com/JovieInc/Jovie.git']);
  git(['add', '.']);
  git([
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.test',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ]);
  const scanInput = {
    sourceRoot,
    workspace: join(root, 'scan'),
    headSha: git(['rev-parse', 'HEAD']),
    files: [file],
    repository: 'JovieInc/Jovie',
    headRepository: 'JovieInc/Jovie',
  };
  const plan = subscriptionPlan(scanInput);
  const result = {
    findings: [],
    receipt: subscriptionReceipt({
      plan,
      findings: [],
      observedHead: plan.headSha,
      sourceChanged: false,
      result: {
        status: 0,
        stdout:
          'Scanning 1 file(s)…\nProcessing complete. Run: actual-fixture\n  Analyses: 1\n  Findings: 0\nNo findings.\n',
      },
    }),
  };
  return { scanInput, result, file };
}

test('controller binds a real git source before scan, comment, ledger write and final verification', async () => {
  for (const prNumber of [undefined, 123]) {
    const f = sourceFixture(),
      calls = [];
    const store = {
      loadLedger: async () => emptyNativeLedger(),
      sourceLease: async identity => {
        assert.equal(identity.headSha, f.scanInput.headSha);
        calls.push('lease');
      },
      saveLedger: async (ledger, lease) => {
        await lease();
        assert.deepEqual(ledger.runs, ['actual-fixture']);
        calls.push('save');
      },
      writeComment: async (number, body, lease) => {
        await lease();
        assert.equal(number, 123);
        assert.match(body, /No findings/);
        calls.push('comment');
      },
    };
    const receipt = await runNativeController({
      scanInput: f.scanInput,
      prNumber,
      store,
      scan: async () => {
        calls.push('scan');
        return f.result;
      },
    });
    assert.equal(receipt.nativeRunId, 'actual-fixture');
    assert.equal(calls[0], 'lease');
    assert.equal(calls[1], 'scan');
    assert.equal(calls.at(-2), 'save');
    assert.equal(calls.at(-1), 'lease');
    assert.equal(calls.includes('comment'), prNumber === 123);
    calls.length = 0;
    store.loadLedger = async () => ({
      ...emptyNativeLedger(),
      runs: ['actual-fixture'],
    });
    await runNativeController({
      scanInput: f.scanInput,
      prNumber,
      store,
      scan: async () => f.result,
    });
    assert.equal(calls.includes('save'), false);
    assert.equal(calls.includes('comment'), false);
  }
});

test('model failure and source drift cannot publish a clean ledger', async () => {
  for (const mode of ['failure', 'drift']) {
    const f = sourceFixture(),
      writes = [];
    const store = {
      loadLedger: async () => emptyNativeLedger(),
      sourceLease: async () => {},
      saveLedger: async () => {
        writes.push('save');
      },
      writeComment: async () => {
        writes.push('comment');
      },
    };
    await assert.rejects(
      runNativeController({
        scanInput: f.scanInput,
        store,
        scan: async () => {
          if (mode === 'failure') throw new Error('quota exhausted');
          writeFileSync(join(f.scanInput.sourceRoot, f.file), 'drift');
          return f.result;
        },
      })
    );
    assert.deepEqual(writes, []);
  }
});

test('CLI is explicitly default-off before any source read or external write', async () => {
  const previous = process.env.DEEPSEC_NATIVE_ENABLED;
  delete process.env.DEEPSEC_NATIVE_ENABLED;
  try {
    await assert.rejects(main(), /disabled/);
  } finally {
    if (previous !== undefined) process.env.DEEPSEC_NATIVE_ENABLED = previous;
  }
  const workflow = readFileSync(
    new URL('../../.github/workflows/deepsec-native.yml', import.meta.url),
    'utf8'
  );
  assert.match(workflow, /vars.DEEPSEC_NATIVE_ENABLED == 'true'/);
  assert.match(workflow, /jovie-native-subscription/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.doesNotMatch(workflow, /AI_GATEWAY|OPENAI_API_KEY|ANTHROPIC/);
});

test('disabled CLI exits nonzero with a bounded diagnostic', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/security/deepsec-native-controller.mjs'],
    {
      encoding: 'utf8',
      env: { ...process.env, DEEPSEC_NATIVE_ENABLED: 'false' },
    }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Native scanner execution is disabled/);
  assert.equal(result.stdout, '');
});
