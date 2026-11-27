import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { triage } from '../hooks/warden-triage.mjs';
import {
  baselineRun,
  digest,
  evaluateRun,
  loadCorpus,
  materializeCorpus,
} from './review-benchmark.mjs';
import { routeDiff } from './review-route.mjs';

const sha = 'a'.repeat(40);
const source = () => ({
  schema: 'jovie.code-review-corpus-source/v1',
  cases: [
    {
      id: 'positive',
      source: {
        repository: 'JovieInc/Jovie',
        originalPr: 1,
        baseSha: 'b'.repeat(40),
        headSha: sha,
      },
      diff: 'diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -0,0 +1 @@\n+unsafe();',
      context: [{ path: 'a.js', revisionSha: sha, content: 'unsafe();' }],
      answer: {
        scope: 'listed-defects-only',
        defects: [
          {
            id: 'bug',
            path: 'a.js',
            startLine: 1,
            endLine: 1,
            rationale: 'Missing guard',
            evidenceUrl: 'https://github.com/JovieInc/Jovie/pull/2',
          },
        ],
        verification: {
          fixSha: 'c'.repeat(40),
          evidenceUrl: 'https://github.com/JovieInc/Jovie/pull/2',
          rationale: 'Fix adds guard',
        },
      },
    },
  ],
});
function corpus() {
  const dir = join(mkdtempSync(join(tmpdir(), 'review-benchmark-')), 'corpus');
  materializeCorpus(source(), dir);
  return { dir, ...loadCorpus(dir) };
}
/**
 * @returns {{schema: string, corpusDigest: string, candidate: {requested: string, verified: string|null, evidence: string, kind: string}, cases: Array<{caseId: string, inputDigest: string, status: string, reason?: string, startedAt?: string, endedAt?: string, costUsd?: number|null, findings?: Array<ReturnType<typeof finding>>, routed?: boolean}>, adjudications?: Array<ReturnType<typeof adjudication>>}}
 */
function run(c, findings = []) {
  return {
    schema: 'jovie.code-review-run/v1',
    corpusDigest: c.manifest.corpusDigest,
    candidate: {
      requested: 'candidate/model',
      verified: 'candidate/model@1',
      evidence: 'local authenticated receipt',
      kind: 'reviewer',
    },
    cases: [
      {
        caseId: 'positive',
        inputDigest: c.manifest.cases[0].inputDigest,
        status: 'completed',
        startedAt: '2026-11-27T00:00:00.000Z',
        endedAt: '2026-11-27T00:00:01.000Z',
        costUsd: null,
        findings,
      },
    ],
  };
}
const finding = (id = 'f1') => ({
  id,
  path: 'a.js',
  startLine: 1,
  endLine: 1,
  summary: 'Missing guard',
});
const adjudication = (findingId, verdict = 'confirmed', defectId = 'bug') => ({
  caseId: 'positive',
  findingId,
  verdict,
  defectId,
  rationale: 'Compared original and verified fix',
  evidenceUrl: 'https://github.com/JovieInc/Jovie/pull/2',
});

test('materializes blind immutable inputs, detects tampering and refuses overwrite', () => {
  const c = corpus();
  const input = readFileSync(join(c.dir, 'inputs/positive.json'), 'utf8');
  assert.equal(input.includes('Missing guard'), false);
  assert.equal(input.includes('fixSha'), false);
  assert.throws(() => materializeCorpus(source(), c.dir), /exist/);
  writeFileSync(join(c.dir, 'inputs/positive.json'), '{}');
  assert.throws(() => loadCorpus(c.dir), /digest/);
});
test('missing cases preserve planned denominator; unavailable is never clean', () => {
  const c = corpus();
  const r = run(c);
  r.cases = [];
  assert.equal(evaluateRun(c, r).confirmedRecall, 0);
  r.cases = [
    {
      caseId: 'positive',
      inputDigest: c.manifest.cases[0].inputDigest,
      status: 'unavailable',
      reason: 'No credentials',
    },
  ];
  const report = evaluateRun(c, r);
  assert.equal(report.completedN, 0);
  assert.equal(report.plannedN, 1);
  assert.equal(report.coverage, 0);
  assert.equal(report.cleanCases, 0);
});
test('confirmed findings require location; duplicates cannot raise recall or precision', () => {
  const c = corpus();
  const r = run(c, [finding(), finding('f2')]);
  r.adjudications = [adjudication('f1'), adjudication('f2')];
  const report = evaluateRun(c, r);
  assert.equal(report.confirmedRecall, 1);
  assert.equal(report.confirmedPrecision, 0.5);
  assert.equal(report.duplicateN, 1);
  assert.equal(report.costUsd, null);
  r.cases[0].findings[0].startLine = 2;
  r.cases[0].findings[0].endLine = 2;
  assert.throws(() => evaluateRun(c, r), /location/);
});
test('false positives, harmful suggestions, pending judgments remain visible', () => {
  const c = corpus();
  const r = run(c, [finding(), finding('f2'), finding('f3')]);
  r.adjudications = [
    adjudication('f1', 'false-positive', null),
    adjudication('f2', 'harmful', null),
  ];
  const report = evaluateRun(c, r);
  assert.equal(report.falsePositiveN, 1);
  assert.equal(report.harmfulN, 1);
  assert.equal(report.pendingN, 1);
  assert.equal(report.confirmedPrecision, 0);
});
test('rejects wrong cohort/digest, duplicate results, fabricated identity and malformed results', () => {
  const c = corpus();
  for (const mutate of [
    r => {
      r.corpusDigest = 'bad';
    },
    r => {
      r.cases[0].inputDigest = 'bad';
    },
    r => {
      r.cases.push(r.cases[0]);
    },
    r => {
      r.candidate.verified = null;
    },
    r => {
      r.cases[0].costUsd = -1;
    },
    r => {
      r.cases[0].findings = null;
    },
    r => {
      r.cases[0].endedAt = '2026-11-26T00:00:00.000Z';
    },
  ]) {
    const r = run(c);
    mutate(r);
    assert.throws(() => evaluateRun(c, r));
  }
});
test('no-model baseline scores zero on positives, route-only cannot claim defect recall', () => {
  const c = corpus();
  const r = run(c);
  r.candidate.kind = 'no-model';
  assert.equal(evaluateRun(c, r).confirmedRecall, 0);
  r.candidate.kind = 'route-only';
  r.cases[0].routed = true;
  const report = evaluateRun(c, r);
  assert.equal(report.confirmedRecall, null);
  assert.equal(report.routingRecall, 1);
});
test('source rejects incomplete snapshots, unverified answers, and traversal ids', () => {
  for (const mutate of [
    s => {
      s.cases[0].id = '../escape';
    },
    s => {
      s.cases[0].context = [];
    },
    s => {
      s.cases[0].context[0].revisionSha = 'd'.repeat(40);
    },
    s => {
      s.cases[0].answer.verification.fixSha = 'main';
    },
  ]) {
    const s = source();
    mutate(s);
    assert.throws(() =>
      materializeCorpus(
        s,
        join(mkdtempSync(join(tmpdir(), 'review-source-')), 'new')
      )
    );
  }
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
});

test('missing snapshots and answer tampering fail closed before scoring', () => {
  const c = corpus();
  unlinkSync(join(c.dir, 'inputs/positive.json'));
  assert.throws(() => loadCorpus(c.dir), /ENOENT/);
  const other = corpus();
  writeFileSync(join(other.dir, 'answers.json'), '{}');
  assert.throws(() => loadCorpus(other.dir), /digest/);
});
test('fixed controls stay scoped and unknown cost differs from measured zero', () => {
  const s = source();
  s.cases.push({
    ...structuredClone(s.cases[0]),
    id: 'control',
    answer: { ...structuredClone(s.cases[0].answer), defects: [] },
  });
  const dir = join(mkdtempSync(join(tmpdir(), 'review-controls-')), 'corpus');
  materializeCorpus(s, dir);
  const c = loadCorpus(dir);
  const r = run(c);
  r.cases.push({
    ...structuredClone(r.cases[0]),
    caseId: 'control',
    inputDigest: c.manifest.cases[1].inputDigest,
  });
  let report = evaluateRun(c, r);
  assert.equal(report.cleanCases, 1);
  assert.equal(report.scope, 'listed-defects-only');
  assert.equal(report.confirmedRecall, 0);
  assert.equal(report.costUsd, null);
  r.cases.forEach(item => {
    item.costUsd = 0;
  });
  report = evaluateRun(c, r);
  assert.equal(report.costUsd, 0);
  assert.equal(report.knownCostN, 2);
  r.cases[1].findings = [finding()];
  r.adjudications = [
    { ...adjudication('f1', 'false-positive', null), caseId: 'control' },
  ];
  report = evaluateRun(c, r);
  assert.equal(report.cleanCases, 0);
  assert.equal(report.falsePositiveN, 1);
});
test('rejects adjudications for missing findings and fabricated findings on unavailable runs', () => {
  const c = corpus();
  const r = run(c);
  r.adjudications = [adjudication('missing')];
  assert.throws(() => evaluateRun(c, r), /missing finding/);
  delete r.adjudications;
  r.cases[0].status = 'unavailable';
  r.cases[0].reason = 'No access';
  assert.throws(() => evaluateRun(c, r), /cannot claim/);
});

test('executes existing route classifier independently of defect answers', () => {
  const c = corpus();
  const clock = () => '2026-11-27T00:00:00.000Z';
  const route = baselineRun(c, 'route-only', clock);
  const expected = triage([{ path: 'a.js', added: 1, deleted: 0 }]);
  assert.equal(route.cases[0].routed, expected.review);
  assert.equal(route.cases[0].routeReason, expected.reason);
  assert.equal(evaluateRun(c, route).routingRecall, expected.review ? 1 : 0);
  const none = baselineRun(c, 'no-model', clock);
  assert.equal(evaluateRun(c, none).confirmedRecall, 0);
  assert.equal(evaluateRun(c, none).costUsd, null);
  c.inputs.positive.diff += '\n+tampered';
  assert.throws(() => baselineRun(c, 'route-only', clock), /digest/);
});

test('pinned historical corpus recipe binds five cases to the trusted manifest', () => {
  const recipe = JSON.parse(
    readFileSync(
      new URL('./review-corpus-recipe.json', import.meta.url),
      'utf8'
    )
  );
  const { corpusDigest, ...body } = recipe.manifest;
  assert.equal(digest(body), corpusDigest);
  assert.equal(recipe.cases.length, 5);
  assert.equal(
    recipe.cases.filter(item => item.answer.defects.length > 0).length,
    4
  );
  assert.deepEqual(
    recipe.cases.map(item => item.id),
    recipe.manifest.cases.map(item => item.id)
  );
  assert.equal(
    corpusDigest,
    '3453dad76ececfd5b6604d94710e8be4c22cae4892e80de78e5b688da6415e45'
  );
});

test('predeclared alternate locations admit equivalent defect evidence without changing frozen answers', () => {
  const s = source();
  const defect = s.cases[0].answer.defects[0];
  const withLocations = {
    ...defect,
    allowedLocations: [{ path: 'consumer.js', startLine: 7, endLine: 9 }],
  };
  s.cases[0].answer.defects[0] = withLocations;
  const dir = join(mkdtempSync(join(tmpdir(), 'review-alternate-')), 'corpus');
  materializeCorpus(s, dir);
  const c = loadCorpus(dir);
  const r = run(c, [
    { ...finding(), path: 'consumer.js', startLine: 8, endLine: 8 },
  ]);
  r.adjudications = [adjudication('f1')];
  assert.equal(evaluateRun(c, r).confirmedN, 1);
  assert.notEqual(c.manifest.corpusDigest, corpus().manifest.corpusDigest);
  withLocations.allowedLocations = [];
  assert.throws(
    () => materializeCorpus(s, join(dir, 'invalid')),
    /allowedLocations/
  );
});

test('route baseline counts added ++ and removed -- expressions like actual staged triage', () => {
  for (const [before, after] of [
    ['', '++a;\n++b;\n++c;\n'],
    ['--a;\n--b;\n--c;\n', ''],
  ]) {
    const repo = mkdtempSync(join(tmpdir(), 'review-route-parity-'));
    const git = args => {
      const result = spawnSync('git', ['-C', repo, ...args], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    try {
      git(['init', '-q']);
      git(['config', 'user.name', 'Route Test']);
      git(['config', 'user.email', 'route@example.test']);
      writeFileSync(join(repo, 'a.js'), before);
      git(['add', 'a.js']);
      git(['commit', '-qm', 'baseline fixture']);
      writeFileSync(join(repo, 'a.js'), after);
      git(['add', 'a.js']);
      const input = source();
      input.cases[0].diff = git(['diff', '--cached']);
      input.cases[0].context[0].content = after;
      const dir = join(repo, 'corpus');
      materializeCorpus(input, dir);
      const baseline = baselineRun(
        loadCorpus(dir),
        'route-only',
        () => '2026-11-27T00:00:00.000Z'
      ).cases[0];
      const live = spawnSync(
        process.execPath,
        [resolve(import.meta.dirname, '../hooks/warden-triage.mjs'), 'staged'],
        { cwd: repo, encoding: 'utf8' }
      );
      assert.equal(live.status, 0, live.stderr);
      assert.equal(baseline.routed, true);
      assert.equal(`review: ${baseline.routeReason}\n`, live.stdout);
      assert.match(baseline.routeReason, /3 changed lines/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }
});

test('route parser preserves risky rename sources for the live classifier', () => {
  const repo = mkdtempSync(join(tmpdir(), 'review-route-rename-'));
  const git = args => {
    const result = spawnSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    git(['init', '-q']);
    git(['config', 'user.name', 'Route Test']);
    git(['config', 'user.email', 'route@example.test']);
    writeFileSync(join(repo, 'auth.ts'), 'export const value = 1;\n');
    git(['add', 'auth.ts']);
    git(['commit', '-qm', 'rename fixture']);
    git(['mv', 'auth.ts', 'notes.md']);
    const [status, oldPath, path] = git([
      'diff',
      '--cached',
      '--name-status',
      '-M',
      '-z',
    ]).split('\0');
    assert.equal(status, 'R100');
    const record = { path, oldPath, added: 0, deleted: 0 };
    assert.deepEqual(
      routeDiff(git(['diff', '--cached', '-M'])),
      triage([record])
    );
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
