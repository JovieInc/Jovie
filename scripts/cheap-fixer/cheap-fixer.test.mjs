import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  interpretPatchVerdict,
  preparePatchVerdictRequest,
} from '../invariants/jev-patch-verdict.mjs';
import {
  activeClaims,
  applyEdits,
  claimBody,
  classifyFailure,
  costUsd,
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

test('applyEdits fails closed on missing or ambiguous search text', () => {
  const contents = { 'a.ts': 'foo\nbar\nfoo\n' };
  assert.equal(
    applyEdits([{ path: 'a.ts', search: 'bar', replace: 'baz' }], contents).ok,
    true
  );
  assert.equal(
    applyEdits([{ path: 'a.ts', search: 'foo', replace: 'x' }], contents)
      .reason,
    'search-ambiguous:a.ts'
  );
  assert.equal(
    applyEdits([{ path: 'a.ts', search: 'nope', replace: 'x' }], contents)
      .reason,
    'search-not-found:a.ts'
  );
  assert.equal(
    applyEdits([{ path: 'b.ts', search: 'a', replace: 'x' }], contents).reason,
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
    files('src/a.ts', 'run();\n', '// @ts-ignore\nrun();\n'),
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

test('parseModelReply handles fenced and bare json; cost uses gateway prices', () => {
  assert.deepEqual(parseModelReply('```json\n{"handoff":"x"}\n```'), {
    handoff: 'x',
  });
  assert.deepEqual(parseModelReply('ok {"a":1} done'), { a: 1 });
  assert.equal(parseModelReply('nope'), null);
  assert.ok(
    Math.abs(
      costUsd('zai/glm-5.3-flash', {
        prompt_tokens: 1000000,
        completion_tokens: 0,
      }) - 0.15
    ) < 1e-9
  );
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

test('fleet kinds, command extraction and red-before-green fill satisfy the real fleet rule', async () => {
  const { evaluateFleetRules } = await import('../pr-fleet-rules.mjs');
  const {
    fleetKinds,
    commandFromLog,
    fillRedBeforeGreen,
    guardFormatterOutput,
  } = await import('./cheap-fixer-lib.mjs');
  assert.deepEqual(
    fleetKinds('::error::Fleet rule evidence unavailable; re-run'),
    ['evidence-unavailable']
  );
  assert.deepEqual(fleetKinds('red-before-green: include Failing command:'), [
    'red-before-green',
  ]);
  const log = [
    '2026-10-24T22:00:00.0000000Z ##[group]Run node scripts/check-things.mjs --strict',
    '2026-10-24T22:00:00.0000000Z shell: /usr/bin/bash -e {0}',
    '2026-10-24T22:00:01.0000000Z ##[error]Process completed with exit code 1.',
  ].join('\n');
  assert.equal(commandFromLog(log), 'node scripts/check-things.mjs --strict');
  assert.equal(commandFromLog('no group here\n##[error]x'), null);
  const evidence = {
    command: 'node scripts/check-things.mjs --strict',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123',
  };
  const pr = body => ({ title: 'fix(ci): repair thing', labels: [], body });
  const files = [
    { filename: 'scripts/x.mjs', status: 'modified', patch: '@@' },
  ];
  const red = 'red-before-green';
  for (const before of [
    '',
    '## Description\n\nhi\n',
    '## Red-before-green\n\nFailing command:\n<!-- c -->\nFailing run (before fix):\n\n## Premise check\n\nx\n',
    '## Red-before-green\n\nFailing command: `real cmd here`\n',
  ]) {
    const filled = fillRedBeforeGreen(before, evidence);
    assert.equal(
      evaluateFleetRules({ pr: pr(before), files }).errors.some(e =>
        e.startsWith(red)
      ),
      true,
      'precondition'
    );
    assert.equal(
      evaluateFleetRules({ pr: pr(filled), files }).errors.some(e =>
        e.startsWith(red)
      ),
      false,
      filled
    );
  }
  assert.match(
    fillRedBeforeGreen(
      '## Red-before-green\n\nFailing command: `real cmd here`\n',
      evidence
    ),
    /real cmd here/
  );
  assert.ok(
    guardFormatterOutput({
      '.github/workflows/a.yml': { before: 'a', after: 'b' },
    }).some(v => v.startsWith('denied-path'))
  );
  assert.deepEqual(
    guardFormatterOutput({ 'src/a.ts': { before: 'a\n', after: 'b\n' } }),
    []
  );
});
