import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFacts } from '../../build-vs-buy-facts.mjs';
import { evaluateFleetRules, section } from '../../pr-fleet-rules.mjs';
import {
  addedDependencies,
  algorithmCore,
  domainOf,
  evaluateBuildVsBuy,
  isMaintainedSource,
  loadConfig,
  newModuleLines,
  reinventions,
} from '../build-vs-buy.mjs';
import {
  computeMetrics,
  countDependencies,
  summarizeMetrics,
} from '../build-vs-buy-metrics.mjs';

const config = loadConfig();
const plus = (...lines) => lines.map(l => `+${l}`).join('\n');
const manifest = (...added) => ({
  filename: 'apps/web/package.json',
  status: 'modified',
  patch: `@@ -1,2 +1,3 @@\n${plus(...added)}`,
});
const source = (filename, lines, extra = {}) => ({
  filename,
  status: 'added',
  additions: lines.length,
  patch: plus(...lines),
  ...extra,
});
const evaluate = (files, body = '', labels = []) =>
  evaluateBuildVsBuy({ body, labels, files, section, config });

const fullDependency = `## Build-vs-buy
- Package: left-pad@1.3.0
- Size: 12 KB unpacked
- Transitive: 0
- Maintenance: last release 30d ago, 3 maintainers, MIT, no open CVEs
- Why: padStart covers a single call but this needs unicode width handling we do not want to own`;

test('config loads and the approved reinvention rules compile', () => {
  assert.equal(config.newModuleLineThreshold, 400);
  for (const rule of config.reinventions)
    assert.doesNotThrow(() => new RegExp(rule.pattern));
});

test('a new dependency without a Build-vs-buy section is an error naming the package', () => {
  const { errors } = evaluate([manifest('    "left-pad": "^1.3.0",')]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^build-vs-buy: .*left-pad.*missing/);
  assert.match(errors[0], /build-vs-buy-facts\.mjs/);
});

test('a complete section passes; each missing field is named', () => {
  const files = [manifest('    "left-pad": "^1.3.0",')];
  assert.deepEqual(evaluate(files, fullDependency).errors, []);
  const partial = fullDependency.replace(/- Transitive:.*\n/, '');
  assert.match(evaluate(files, partial).errors[0], /"- Transitive:"/);
  const noWhy = fullDependency.replace(/- Why:.*/, '- Why: ok');
  assert.match(evaluate(files, noWhy).errors[0], /"- Why:"/);
  const wrongName = fullDependency.replace('left-pad@1.3.0', 'other@1');
  assert.match(evaluate(files, wrongName).errors[0], /naming left-pad/);
  const placeholder = fullDependency.replace(
    /- Maintenance:.*/,
    '- Maintenance: <fill in>'
  );
  assert.match(evaluate(files, placeholder).errors[0], /"- Maintenance:"/);
});

test('version bumps, workspace packages and non-dependency keys are not adds', () => {
  const bump = {
    filename: 'package.json',
    status: 'modified',
    patch: `@@ -1 +1 @@\n-    "zod": "^4.6.6",\n+    "zod": "^4.6.7",`,
  };
  assert.deepEqual(addedDependencies([bump], config), []);
  assert.deepEqual(
    addedDependencies(
      [
        manifest(
          '  "version": "1.2.3",',
          '    "@jovie/ui": "workspace:*",',
          '  "name": "x"'
        ),
      ],
      config
    ),
    []
  );
  assert.deepEqual(
    addedDependencies(
      [{ filename: 'README.md', patch: plus('"a": "1.0.0"') }],
      config
    ),
    []
  );
  assert.equal(
    addedDependencies([manifest('    "@scope/pkg": "npm:other@^2",')], config)
      .length,
    1
  );
});

test('a large new module needs Considered and Why; tests and generated files do not count', () => {
  const big = source(
    'apps/web/lib/foo/engine.ts',
    Array(450).fill('const a = 1;')
  );
  const { errors } = evaluate([big]);
  assert.match(errors[0], /450 hand-written lines in apps\/web\/lib\/foo/);
  const ok = `## Build-vs-buy
- Considered: p-queue, bullmq, the Vercel Queues primitive
- Why: none model our per-artist fairness rule, which is the moat`;
  assert.deepEqual(evaluate([big], ok).errors, []);

  const noise = [
    source('apps/web/lib/foo/engine.test.ts', Array(900).fill('x')),
    source('apps/web/lib/foo/data.gen.ts', Array(900).fill('x')),
    source('apps/web/tests/e2e/a.ts', Array(900).fill('x')),
    source('.github/actions/vendor/x/index.js', Array(900).fill('x')),
    source('docs/big.md', Array(900).fill('x')),
  ];
  assert.deepEqual(newModuleLines(noise, config), []);
  assert.deepEqual(evaluate(noise).errors, []);
  const modified = { ...big, status: 'modified' };
  assert.deepEqual(newModuleLines([modified], config), []);
  const small = source('apps/web/lib/foo/small.ts', Array(399).fill('x'));
  assert.deepEqual(evaluate([small]).errors, []);
});

test('domains sum across files and stop four segments deep', () => {
  assert.equal(domainOf('apps/web/lib/foo/bar/baz.ts'), 'apps/web/lib/foo');
  assert.equal(domainOf('scripts/x.mjs'), 'scripts');
  assert.equal(domainOf('top.ts'), '.');
  const a = source('apps/web/lib/foo/a.ts', Array(250).fill('x'));
  const b = source('apps/web/lib/foo/b.ts', Array(250).fill('x'));
  assert.deepEqual(newModuleLines([a, b], config), [
    { domain: 'apps/web/lib/foo', lines: 500 },
  ]);
  assert.equal(isMaintainedSource('a.png', config), false);
});

test('known reinventions are flagged with the approved package; waivers and owners are exempt', () => {
  const cases = [
    ['export function addDays(d, n) {', 'date-fns'],
    ['const parseMarkdown = (s) => s;', 'remark'],
    ['async function withRetry(fn) {', 'api-client'],
    ['const delay = Math.pow(2, attempt) * 100;', 'api-client'],
    ['function debounce(fn, ms) {', 'react-pacer'],
    ['function parseCsv(text) {', 'csv-parse'],
    ['function generateUuid() {', 'randomUUID'],
    ['function deepClone(x) {', 'structuredClone'],
    ['const cx = (...a) => a.join(" ");', 'clsx'],
  ];
  for (const [line, approved] of cases) {
    const hits = reinventions([source('apps/web/lib/util.ts', [line])], config);
    assert.equal(hits.length, 1, line);
    assert.match(hits[0].approved, new RegExp(approved), line);
    assert.match(
      evaluate([source('apps/web/lib/util.ts', [line])]).errors.join('\n'),
      /^reinvention: /,
      line
    );
  }
  const waived = source('apps/web/lib/util.ts', [
    '// build-vs-buy-ok: needs month-end semantics date-fns lacks',
    'function addDays(d, n) {',
  ]);
  assert.deepEqual(reinventions([waived], config), []);
  const sameLine = source('apps/web/lib/util.ts', [
    'function addDays(d) { // build-vs-buy-ok: why',
  ]);
  assert.deepEqual(reinventions([sameLine], config), []);
  assert.deepEqual(
    reinventions(
      [
        source('packages/api-client/retry.ts', [
          'async function withRetry(fn) {',
        ]),
      ],
      config
    ),
    []
  );
  assert.deepEqual(
    reinventions(
      [source('apps/web/lib/pacer/debounce.ts', ['function debounce(fn) {'])],
      config
    ),
    []
  );
  // Only TS/JS, only maintained, only added lines.
  assert.deepEqual(
    reinventions([source('a.py', ['def addDays(d):'])], config),
    []
  );
  assert.deepEqual(
    reinventions(
      [source('apps/web/lib/x.test.ts', ['function addDays() {'])],
      config
    ),
    []
  );
  assert.deepEqual(
    reinventions(
      [
        {
          filename: 'apps/web/lib/x.ts',
          patch: '-function addDays() {\n context',
        },
      ],
      config
    ),
    []
  );
});

const priorArt = `## Prior art
- Links: https://dl.acm.org/doi/10.1145/example and https://github.com/example/ranker
- Research: research/ranking-prior-art
- Comparison: we kept their decay curve but replaced the global sort with a per-artist cap because of our permission model
- Benchmark: apps/web/lib/ranking/ranking.bench.ts compares NDCG against the reference on the same fixtures`;

test('an algorithmic core needs Prior art with links, research, comparison and benchmark', () => {
  const core = source('apps/web/lib/ranking/score.ts', [
    'export const score = 1;',
  ]);
  const missing = evaluate([core]).errors[0];
  assert.match(
    missing,
    /^prior-art: .*apps\/web\/lib\/ranking\/score\.ts.*missing/
  );
  assert.deepEqual(evaluate([core], priorArt).errors, []);
  for (const [drop, label] of [
    [/https:\/\/\S+/g, 'https link'],
    [/- Research:.*/, 'Research'],
    [/- Comparison:.*/, 'Comparison'],
    [/- Benchmark:.*/, 'Benchmark'],
  ]) {
    const error = evaluate([core], priorArt.replace(drop, '')).errors[0];
    assert.match(error, new RegExp(label), label);
  }
  assert.match(
    evaluate([core], priorArt.replace('research/ranking-prior-art', 'notes/x'))
      .errors[0],
    /Research: research/
  );
});

test('algorithm detection: label, new files, rewrites; not small edits or tests', () => {
  assert.deepEqual(algorithmCore([], ['type: algorithm'], config), ['label']);
  assert.match(
    evaluate([], '', ['type:algorithm']).errors[0],
    /labeled type: algorithm/
  );
  const edit = {
    filename: 'apps/web/lib/ranking/a.ts',
    status: 'modified',
    additions: 10,
    deletions: 5,
  };
  assert.deepEqual(algorithmCore([edit], [], config), []);
  const rewrite = { ...edit, additions: 100, deletions: 60 };
  assert.deepEqual(algorithmCore([rewrite], [], config), [rewrite.filename]);
  const test_ = { filename: 'apps/web/lib/ranking/a.test.ts', status: 'added' };
  assert.deepEqual(algorithmCore([test_], [], config), []);
  for (const dir of [
    'resolver',
    'matching',
    'scheduler',
    'pricing',
    'scoring',
    'merge-queue',
  ])
    assert.equal(
      algorithmCore(
        [{ filename: `apps/web/lib/${dir}/x.ts`, status: 'added' }],
        [],
        config
      ).length,
      1,
      dir
    );
  assert.deepEqual(
    algorithmCore(
      [{ filename: 'apps/web/lib/profile/queue.ts', status: 'added' }],
      [],
      config
    ),
    []
  );
});

test('Fleet Rules runs the build-vs-buy checks through its single call site', () => {
  const files = [manifest('    "left-pad": "^1.3.0",')];
  const bad = evaluateFleetRules({
    pr: { title: 'feat: x', body: '', labels: [] },
    files,
  });
  assert.ok(bad.errors.some(e => e.startsWith('build-vs-buy:')));
  const good = evaluateFleetRules({
    pr: { title: 'feat: x', body: fullDependency, labels: [] },
    files,
  });
  assert.ok(!good.errors.some(e => e.startsWith('build-vs-buy:')));
});

test('metrics count dependencies, lines per domain, standing reinventions and waivers', () => {
  const manifests = [
    {
      path: 'a/package.json',
      json: {
        dependencies: { x: '1', '@jovie/ui': 'workspace:*' },
        devDependencies: { y: '1' },
      },
    },
    {
      path: 'b/package.json',
      json: { dependencies: { x: '1' }, optionalDependencies: { z: '1' } },
    },
  ];
  assert.deepEqual(countDependencies(manifests), {
    manifests: 2,
    unique: 3,
    prod: 2,
    dev: 1,
  });
  const files = [
    {
      path: 'apps/web/lib/a/x.ts',
      text: 'function addDays() {}\nconst a = 1;',
    },
    {
      path: 'apps/web/lib/a/y.ts',
      text: '// build-vs-buy-ok: reason\nfunction debounce() {}',
    },
    { path: 'apps/web/lib/a/x.test.ts', text: 'function addDays() {}' },
  ];
  const metrics = computeMetrics({ manifests, files, config, now: 0 });
  assert.equal(metrics.maintainedLines.total, 4);
  assert.deepEqual(metrics.maintainedLines.byDomain, { 'apps/web/lib/a': 4 });
  assert.deepEqual(metrics.reinventions, {
    standing: { 'date-helpers': 1 },
    standingTotal: 1,
    waivers: 1,
  });
  assert.equal(metrics.generatedAt, '1970-01-01T00:00:00.000Z');
  const summary = summarizeMetrics(metrics);
  assert.deepEqual(
    {
      d: summary.dependencies,
      l: summary.maintainedLines,
      r: summary.standingReinventions,
      w: summary.waivers,
    },
    { d: 3, l: 4, r: 1, w: 1 }
  );
});

test('facts block satisfies the dependency section the rule demands', () => {
  const block = formatFacts({
    name: 'left-pad',
    meta: {
      version: '1.3.0',
      dist: { unpackedSize: 12288 },
      time: { '1.3.0': '2026-09-29T00:00:00Z' },
      maintainers: [{}, {}],
      license: 'MIT',
    },
    transitive: 0,
    now: Date.parse('2026-10-29T00:00:00Z'),
  });
  assert.match(block, /Package: left-pad@1\.3\.0/);
  assert.match(block, /12 KB unpacked/);
  assert.match(block, /last release 30d ago, 2 maintainers, license MIT/);
  const body = `## Build-vs-buy\n${block.replace('<why not a few lines, an existing dependency, or a platform feature>', 'padStart cannot do unicode width and we refuse to own that tail')}`;
  assert.deepEqual(
    evaluate([manifest('    "left-pad": "^1.3.0",')], body).errors,
    []
  );
  const unknown = formatFacts({
    name: 'x',
    meta: { version: '1' },
    transitive: null,
  });
  assert.match(unknown, /Size: unknown/);
  assert.match(unknown, /Transitive: unknown/);
  assert.match(unknown, /\? maintainers/);
});
