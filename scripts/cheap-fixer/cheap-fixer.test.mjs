import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { load as loadYaml } from 'js-yaml';
import {
  interpretPatchVerdict,
  preparePatchVerdictRequest,
} from '../invariants/jev-patch-verdict.mjs';
import { dormantReceipt, main } from './cheap-fixer.mjs';
import {
  activeClaims,
  applyEdits,
  claimBody,
  classifyFailure,
  guardPatch,
  parseModelReply,
  pathDenied,
  pathsInLog,
} from './cheap-fixer-lib.mjs';

test('classifies failures and sends infra/unknown away from the model', () => {
  assert.equal(
    classifyFailure("error TS2339: Property 'x' does not exist"),
    'typecheck'
  );
  assert.equal(
    classifyFailure('Formatter would have printed the following content'),
    'format'
  );
  assert.equal(classifyFailure('lint/style/noUnusedVariables'), 'lint');
  assert.equal(classifyFailure('1 snapshot obsolete'), 'snapshot');
  assert.equal(classifyFailure('ECONNRESET talking to registry'), 'infra');
  assert.equal(classifyFailure('something odd'), 'unknown');
});

/**
 * checkJs does not narrow `!result.ok` on applyEdits' union. `=== false` does.
 * @param {{ ok: true, files: Record<string, { before: string, after: string }> } | { ok: false, reason: string }} result
 */
const rejectionReason = result => {
  if (result.ok === false) return result.reason;
  throw new Error('expected a rejected edit');
};

test('applyEdits fails closed on missing or ambiguous search text', () => {
  const contents = { 'a.ts': 'foo\nbar\nfoo\n' };
  assert.equal(
    applyEdits([{ path: 'a.ts', search: 'bar', replace: 'baz' }], contents).ok,
    true
  );
  assert.equal(
    rejectionReason(
      applyEdits([{ path: 'a.ts', search: 'foo', replace: 'x' }], contents)
    ),
    'search-ambiguous:a.ts'
  );
  assert.equal(
    rejectionReason(
      applyEdits([{ path: 'a.ts', search: 'nope', replace: 'x' }], contents)
    ),
    'search-not-found:a.ts'
  );
  assert.equal(
    rejectionReason(
      applyEdits([{ path: 'b.ts', search: 'a', replace: 'x' }], contents)
    ),
    'unseen-file:b.ts'
  );
});

const files = (path, before, after) => ({ [path]: { before, after } });

test('guards reject weakened tests, suppressions, denied and out-of-scope paths', () => {
  const inPr = new Set(['src/a.ts', 'src/a.test.ts']);
  assert.deepEqual(
    guardPatch(files('src/a.ts', 'let a = 1;\n', 'let a = 2;\n'), {
      changedInPr: inPr,
      failureClass: 'lint',
    }),
    []
  );
  const skip = guardPatch(
    files(
      'src/a.ts',
      'run();\n',
      `// @${['ts', 'ignore'].join('-')}\nrun();\n`
    ),
    { changedInPr: inPr, failureClass: 'typecheck' }
  );
  assert.ok(skip.some(v => v.startsWith('weakening-added')));
  const dropped = guardPatch(
    files('src/a.test.ts', 'expect(a).toBe(1);\n', ''),
    { changedInPr: inPr, failureClass: 'lint' }
  );
  assert.ok(dropped.some(v => v.startsWith('assertions-removed')));
  assert.ok(
    guardPatch(files('src/a.test.ts', 'x\n', 'y\n'), {
      changedInPr: inPr,
      failureClass: 'test',
    }).some(v => v.startsWith('test-file-edit'))
  );
  assert.ok(
    guardPatch(files('.github/workflows/ci.yml', 'a\n', 'b\n'), {
      changedInPr: new Set(['.github/workflows/ci.yml']),
      failureClass: 'lint',
    }).some(v => v.startsWith('denied-path'))
  );
  assert.ok(
    guardPatch(files('src/other.ts', 'a\n', 'b\n'), {
      changedInPr: inPr,
      failureClass: 'lint',
    }).some(v => v.startsWith('out-of-scope'))
  );
  assert.ok(
    pathDenied('pnpm-lock.yaml') &&
      pathDenied('apps/web/lib/auth/session.ts') &&
      !pathDenied('apps/web/lib/a.ts') &&
      pathDenied('../x')
  );
});

test('every cheap class refuses assertion rewrites and arbitrary generated scope', () => {
  for (const failureClass of ['lint', 'format', 'typecheck', 'generated']) {
    for (const path of ['src/a.test.ts', 'src/assertions.ts']) {
      const violations = guardPatch(
        files(
          path,
          'expect(result).toBeTruthy();\n',
          'expect(result).toBeFalsy();\n'
        ),
        { changedInPr: new Set([path]), failureClass }
      );
      assert.ok(
        violations.some(v => v.startsWith('assertions-changed:')),
        `${failureClass}:${path}`
      );
    }
  }
});

test('generated failure class retains explicit PR path scope', () => {
  assert.ok(
    guardPatch(files('src/unrelated.ts', 'a\n', 'b\n'), {
      changedInPr: new Set(['src/changed.ts']),
      failureClass: 'generated',
    }).some(v => v.startsWith('out-of-scope:'))
  );
  assert.deepEqual(
    guardPatch(files('src/changed.ts', 'a\n', 'b\n'), {
      changedInPr: new Set(['src/changed.ts']),
      failureClass: 'generated',
    }),
    []
  );
});

test('pathsInLog keeps only files the PR changed or snapshots', () => {
  const log =
    'error in apps/web/lib/a.ts:12:3 and apps/web/lib/other.ts:1 and __snapshots__/a.snap';
  assert.deepEqual(pathsInLog(log, new Set(['apps/web/lib/a.ts'])).sort(), [
    '__snapshots__/a.snap',
    'apps/web/lib/a.ts',
  ]);
});

test('claims use the lane claim comment format and TTL', () => {
  const sha = 'a'.repeat(40);
  const now = Date.parse('2026-10-24T12:00:00Z') / 1000;
  const comments = [
    {
      id: 1,
      created_at: 'x',
      body: claimBody(sha, 'gem', '2026-10-24T11:30:00Z'),
    },
    {
      id: 2,
      created_at: 'x',
      body: claimBody(sha, 'gem', '2026-10-24T08:00:00Z'),
    },
    {
      id: 3,
      created_at: 'x',
      body: claimBody('b'.repeat(40), 'gem', '2026-10-24T11:59:00Z'),
    },
  ];
  assert.deepEqual(
    activeClaims(comments, sha, now).map(c => c.commentId),
    [1]
  );
});

test('parseModelReply handles fenced and bare json', () => {
  assert.deepEqual(parseModelReply('```json\n{"handoff":"x"}\n```'), {
    handoff: 'x',
  });
  assert.deepEqual(parseModelReply('ok {"a":1} done'), { a: 1 });
  assert.equal(parseModelReply('nope'), null);
});

test('Jev verdict approves only approve at or above the floor', () => {
  const res = (choice, p) => ({
    answers: {
      verdict: { type: 'choice', choice, probabilities: { [choice]: p } },
    },
  });
  assert.equal(
    interpretPatchVerdict(res('approve', 0.9)).detail.decision.approved,
    true
  );
  assert.equal(
    interpretPatchVerdict(res('approve', 0.7)).detail.decision.approved,
    false
  );
  assert.equal(
    interpretPatchVerdict(res('reject_weakens', 0.99)).detail.decision.approved,
    false
  );
  assert.equal(interpretPatchVerdict(res('bogus', 1)).invalid, true);
  const req = preparePatchVerdictRequest({
    sourceSha: 'a'.repeat(40),
    artifactSha256: 'b'.repeat(64),
    failureClass: 'lint',
    workflow: 'CI',
    job: 'lint',
    log: 'error here',
    diff: '-a\n+b',
  });
  assert.equal(req.questions.verdict.type, 'choice');
});

test('every proposed patch rejects lint and formatter suppression directives', () => {
  for (const [tool, directive] of [
    ['eslint', 'disable'],
    ['eslint', 'disable-next-line'],
    ['biome', 'ignore'],
    ['biome', 'ignore-all'],
    ['prettier', 'ignore'],
  ]) {
    const suppression = `${tool}-${directive}`;
    const violations = guardPatch(
      files('src/a.ts', 'run();\n', `// ${suppression}\nrun();\n`),
      { changedInPr: new Set(['src/a.ts']), failureClass: 'format' }
    );
    assert.ok(
      violations.some(v => v.startsWith('weakening-added:')),
      suppression
    );
  }
});

/**
 * @typedef {{ uses?: string, with?: Record<string, string> }} WorkflowStep
 * @typedef {{ jobs: { fix: { steps: WorkflowStep[] } } }} CheapFixerWorkflow
 */

test('the workflow sparse checkout boots Node and the fixer without network access', () => {
  const root = resolve(import.meta.dirname, '../..');
  const workflow = /** @type {CheapFixerWorkflow} */ (
    loadYaml(
      readFileSync(join(root, '.github/workflows/cheap-fixer.yml'), 'utf8')
    )
  );
  const checkout = workflow.jobs.fix.steps.find(step =>
    step.uses?.startsWith('actions/checkout@')
  );
  const setup = workflow.jobs.fix.steps.find(step =>
    step.uses?.startsWith('actions/setup-node@')
  );
  const prime = workflow.jobs.fix.steps.find(
    step => step.uses === './.github/actions/prime-node-toolcache'
  );
  const sandbox = mkdtempSync(join(tmpdir(), 'cheap-fixer-workflow-'));
  try {
    for (const path of checkout.with['sparse-checkout'].trim().split(/\s+/)) {
      mkdirSync(dirname(join(sandbox, path)), { recursive: true });
      cpSync(join(root, path), join(sandbox, path), { recursive: true });
    }
    assert.ok(prime, 'the workflow primes the Node cache');
    assert.ok(
      workflow.jobs.fix.steps.indexOf(prime) <
        workflow.jobs.fix.steps.indexOf(setup)
    );
    const versionFile = setup.with['node-version-file'];
    const version = readFileSync(join(sandbox, versionFile), 'utf8').trim();
    assert.equal(version, readFileSync(join(root, '.nvmrc'), 'utf8').trim());
    const action = join(sandbox, prime.uses);
    loadYaml(readFileSync(join(action, 'action.yml'), 'utf8'));
    const cache = join(sandbox, 'toolcache');
    const cached = join(cache, 'node', version, 'x64');
    mkdirSync(cached, { recursive: true });
    writeFileSync(`${cached}.complete`, '');
    const primed = spawnSync('bash', [join(action, 'prime.sh')], {
      cwd: sandbox,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        PATH: process.env.PATH,
        RUNNER_TOOL_CACHE: cache,
        NODE_VERSION_FILE: versionFile,
        PRIME_NODE_PLATFORM: 'linux',
        PRIME_NODE_ARCH: 'x64',
      },
    });
    assert.equal(primed.status, 0, primed.stderr);
    assert.match(primed.stdout, /already in the toolcache/);
    const event = join(sandbox, 'event.json');
    const out = join(sandbox, 'out');
    writeFileSync(
      event,
      JSON.stringify({
        workflow_run: {
          id: 1,
          name: 'CI',
          pull_requests: [],
          head_sha: 'a'.repeat(40),
        },
      })
    );
    // Fail any accidental outbound request, even if a developer has credentials.
    const offline = join(sandbox, 'offline.mjs');
    writeFileSync(
      offline,
      "globalThis.fetch = () => { throw new Error('unexpected network request'); };\n"
    );
    const boot = spawnSync(
      process.execPath,
      ['--import', offline, 'scripts/cheap-fixer/cheap-fixer.mjs'],
      {
        cwd: sandbox,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          PATH: process.env.PATH,
          HOME: sandbox,
          MODE: 'shadow',
          EVENT_PATH: event,
          OUT_DIR: out,
        },
      }
    );
    assert.equal(boot.status, 0, boot.stderr);
    const receipt = JSON.parse(readFileSync(join(out, 'receipt.json'), 'utf8'));
    assert.equal(receipt.outcome, 'backend-unconfigured', receipt.error);
    assert.equal(receipt.mode, 'off');
    assert.equal(receipt.costUsd, 0);
    // Even old push credentials cannot activate a repair or any request.
    writeFileSync(
      event,
      JSON.stringify({
        workflow_run: {
          id: 1,
          name: 'CI',
          pull_requests: [{ number: 1 }],
          head_sha: 'a'.repeat(40),
        },
      })
    );
    const read = spawnSync(
      process.execPath,
      ['--import', offline, 'scripts/cheap-fixer/cheap-fixer.mjs'],
      {
        cwd: sandbox,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          PATH: process.env.PATH,
          HOME: sandbox,
          MODE: 'shadow',
          EVENT_PATH: event,
          OUT_DIR: out,
          GH_READ_TOKEN: 'fixture-read',
          GH_TOKEN: 'fixture-write',
        },
      }
    );
    assert.equal(read.status, 0, read.stderr);
    const readReceipt = JSON.parse(
      readFileSync(join(out, 'receipt.json'), 'utf8')
    );
    assert.equal(
      readReceipt.outcome,
      'backend-unconfigured',
      readReceipt.error
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test('all requested modes stay dormant without network or credential access', () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('unexpected network request');
  };
  try {
    for (const mode of [
      undefined,
      'off',
      'shadow',
      'push',
      'workers-ai-fx',
      'invalid',
    ]) {
      const times = ['2026-11-02T00:00:00.000Z', '2026-11-02T00:00:00.050Z'];
      const env = new Proxy(
        { MODE: mode },
        {
          get(target, name) {
            if (/TOKEN|API_KEY|SECRET/.test(String(name)))
              throw new Error('credential read');
            return target[name];
          },
        }
      );
      const receipt = dormantReceipt({
        env,
        now: () => new Date(times.shift()),
      });
      assert.equal(receipt.mode, 'off');
      assert.equal(receipt.attempted, false);
      assert.equal(receipt.pushedSha, null);
      assert.equal(receipt.costUsd, 0);
      assert.equal(receipt.durationMs, 50);
      assert.deepEqual(receipt.models, []);
      assert.equal(
        receipt.outcome,
        !mode || mode === 'off' ? 'disabled' : 'backend-unconfigured'
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('terminal receipts retain event identity and malformed-event failures', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cheap-fixer-receipt-'));
  try {
    const event = join(dir, 'event.json');
    writeFileSync(
      event,
      JSON.stringify({
        workflow_run: {
          id: 42,
          name: 'CI',
          head_sha: 'a'.repeat(40),
          pull_requests: [{ number: 9 }],
        },
      })
    );
    const receipt = dormantReceipt({
      env: { MODE: 'shadow', EVENT_PATH: event },
    });
    assert.equal(receipt.runId, 42);
    assert.equal(receipt.pr, 9);
    assert.equal(receipt.sha, 'a'.repeat(40));
    writeFileSync(event, 'bad json');
    assert.equal(
      dormantReceipt({ env: { EVENT_PATH: event } }).outcome,
      'event-unreadable'
    );
    assert.equal(
      dormantReceipt({ env: { EVENT_PATH: join(dir, 'absent') } }).outcome,
      'event-unreadable'
    );
    for (const invalid of [
      {},
      { workflow_run: {} },
      {
        workflow_run: { id: 1, name: 'CI', head_sha: 'bad', pull_requests: [] },
      },
      {
        workflow_run: {
          id: 1,
          name: '',
          head_sha: 'a'.repeat(40),
          pull_requests: [],
        },
      },
      {
        workflow_run: {
          id: 1,
          name: 'CI',
          head_sha: 'a'.repeat(40),
          pull_requests: {},
        },
      },
      {
        workflow_run: {
          id: 1,
          name: 'CI',
          head_sha: 'a'.repeat(40),
          pull_requests: [{ number: -1 }],
        },
      },
      { workflow_run: [] },
    ]) {
      writeFileSync(event, JSON.stringify(invalid));
      assert.equal(
        dormantReceipt({ env: { EVENT_PATH: event } }).outcome,
        'event-unreadable'
      );
    }
    assert.equal(
      dormantReceipt({ env: { REPO: 'example/repository' } }).repo,
      'example/repository'
    );
    const summary = join(dir, 'summary.md');
    assert.equal(
      main({ env: { OUT_DIR: dir, GITHUB_STEP_SUMMARY: summary } }),
      0
    );
    assert.match(readFileSync(summary, 'utf8'), /no repair attempted/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Jev verdict rejects missing, malformed and inherited labels', () => {
  for (const result of [
    null,
    {},
    { answers: {} },
    { answers: { verdict: { type: 'text', choice: 'approve' } } },
    { answers: { verdict: { type: 'choice', choice: 'constructor' } } },
    { answers: { verdict: { type: 'choice', choice: '__proto__' } } },
  ]) {
    assert.deepEqual(interpretPatchVerdict(result), { invalid: true });
  }
});

test('Jev approval requires finite confidence at the exact floor', () => {
  const verdict = probability =>
    interpretPatchVerdict({
      answers: {
        verdict: {
          type: 'choice',
          choice: 'approve',
          probabilities: { approve: probability },
        },
      },
    }).detail;
  for (const probability of [
    undefined,
    null,
    '1',
    Number.NaN,
    Infinity,
    -Infinity,
  ]) {
    const detail = verdict(probability);
    assert.equal(detail.decision.approved, false);
    assert.equal(detail.decision.confidence, null);
    assert.equal(detail.shadow, true);
  }
  const missing = interpretPatchVerdict({
    answers: { verdict: { type: 'choice', choice: 'approve' } },
  });
  assert.equal(missing.detail.decision.approved, false);
  for (const [probability, confidence, approved] of [
    [-1, 0, false],
    [0.799, 0.799, false],
    [0.8, 0.8, true],
    [2, 1, true],
  ]) {
    assert.equal(verdict(probability).decision.confidence, confidence);
    assert.equal(verdict(probability).decision.approved, approved);
  }
});

test('patch verdict requests reject absent diffs and bound untrusted diff bytes', () => {
  const base = {
    sourceSha: 'a'.repeat(40),
    artifactSha256: 'b'.repeat(64),
    failureClass: 'generated',
    workflow: 'CI',
    job: 'unit',
    log: 'synthetic failure',
  };
  for (const diff of [undefined, null, '', '  ']) {
    assert.throws(
      () => preparePatchVerdictRequest({ ...base, diff }),
      /diff required/
    );
  }
  const prefix = '+' + 'x'.repeat(7999);
  const request = preparePatchVerdictRequest({
    ...base,
    diff: prefix + 'OUTSIDE_BOUND',
  });
  const diff = request.state.split('\nPROPOSED DIFF:\n')[1];
  assert.equal(Buffer.byteLength(diff), 8000);
  assert.equal(diff, prefix);
  assert.equal(request.questions.verdict.type, 'choice');
});
