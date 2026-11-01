import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, it } from 'vitest';
import {
  buildReport,
  certifyComponent,
  findJank,
  findRawColors,
  findRawElements,
  renderAgentSpec,
  statesCovered,
  summarizeGuards,
} from '../component-certificate.mjs';
import { moduleKey } from '../mutation-sweep.mjs';

const sourceHash = source => createHash('sha256').update(source).digest('hex');
const gitBlob = source =>
  createHash('sha1')
    .update(`blob ${Buffer.byteLength(source)}\0`)
    .update(source)
    .digest('hex');

const stories = [
  'Loading',
  'Empty',
  'Error',
  'Partial',
  'LongContent',
  'Offline',
  'PermissionDenied',
  'Rtl',
]
  .map(name => `export const ${name}={};`)
  .join('\n');
const criterion = (cert, id) => cert.criteria.find(row => row.id === id);
function assertCriteria(cert, expected) {
  for (const [id, status] of Object.entries(expected)) {
    assert.equal(criterion(cert, id).status, status, id);
    assert.equal(
      cert.missing.some(row => row.criterion === id),
      ['fail', 'unknown'].includes(status),
      id
    );
  }
  if (
    Object.values(expected).some(status => ['fail', 'unknown'].includes(status))
  )
    assert.equal(cert.certified, false);
}
const mutationReceipt = (source, tests = []) => ({
  status: 'scored',
  score: 100,
  valid: 10,
  sha: 'a'.repeat(40),
  blob: moduleKey(gitBlob(source), tests.map(gitBlob)),
});

describe('component certificate', () => {
  const clean = `export function Card({ title }: { title: string }) { return <div className="bg-surface-1 text-primary-token">{title}</div>; }`;

  it.each([
    `const a = "bg-blue-500 text-white"; const b = '#fff'; const c = "rgb(1,2,3)";`,
    `const A = () => <div className="bg-blue-500 text-white" data-hex="#fff" data-rgb="rgb(1,2,3)" />;`,
    `const A = () => <div className={"bg-blue-500 text-white"} data-hex={'#fff'} data-rgb={"rgb(1,2,3)"} />;`,
  ])('raw colours are counted once and tokens excluded: %s', source => {
    assert.equal(findRawColors(clean, 'a.tsx').length, 0);
    const kinds = findRawColors(source, 'a.tsx').map(h => h.kind);
    assert.deepEqual(kinds.sort(), [
      'color-function',
      'hex',
      'raw-white-black',
      'tailwind-palette',
    ]);
  });

  it('raw elements: button/input flagged', () => {
    assert.deepEqual(
      findRawElements(
        'export const A = () => <div><button/><input/></div>;',
        'a.tsx'
      ),
      ['button', 'input']
    );
  });

  it('jank: inline component, autoFocus, unstable key, img, reset-on-open effect', () => {
    const src = `
export function Drawer({ open }) {
  const [title, setTitle] = useState('');
  useEffect(() => { if (!open) resetForm(); }, [open]);
  const Field = () => <input autoFocus value={title} onChange={e => setTitle(e.target.value)} />;
  return <div><Field /><img src="x" /><li key={Math.random()} /></div>;
}`;
    const rules = findJank(src, 'a.tsx')
      .map(f => f.rule)
      .sort();
    assert.deepEqual(rules, [
      'focus-loss:autofocus',
      'focus-loss:inline-component',
      'focus-loss:unstable-key',
      'input-reset:effect-resets-on-open-state',
      'layout-shift:img-no-dimensions',
    ]);
    assert.deepEqual(findJank(clean, 'a.tsx'), []);
  });

  it('state stories are matched by export name', () => {
    const c = statesCovered(
      'export const Loading = {}; export const EmptyState = {}; export const RtlLong = {};'
    );
    assert.equal(c.loading, true);
    assert.equal(c.empty, true);
    assert.equal(c['rtl-overflow'], true);
    assert.equal(c.error, false);
  });

  const full = {
    source: `export function List({ items, isLoading, error, title }: { items?: string[]; isLoading?: boolean; error?: string; title?: string }) {
  if (error) return <p>{error}</p>;
  return <ul>{items?.map(i => <li key={i}>{i}</li>)}</ul>;
}`,
    testSource: `it('x', async () => { await userEvent.click(x); expect(1).toBe(1); await expectNoA11yViolations(c); });`,
  };

  it('uncertified component lists exact missing criteria; unknown counts as missing', () => {
    const cert = certifyComponent({
      path: 'apps/web/components/molecules/List.tsx',
      ...full,
      storySource: 'export const Default = {};',
    });
    assert.equal(cert.certified, false);
    const ids = cert.missing.map(m => m.criterion);
    for (const id of ['states', 'mutation', 'visual', 'benchmark'])
      assert.ok(ids.includes(id), id);
    assert.equal(cert.criteria.find(c => c.id === 'a11y').status, 'pass');
    assert.equal(cert.criteria.find(c => c.id === 'journeys').status, 'na');
  });

  it('fully evidenced component certifies; stale benchmark and low mutation do not', () => {
    const binding = sourceHash(full.source);
    const evidence = {
      mutation: mutationReceipt(full.source, [full.testSource]),
      visual: { status: 'pass', captured: 5, sourceHash: binding },
      benchmark: {
        libraryVersion: 1,
        sourceHash: binding,
        gaps: [
          { item: 'x', decision: 'adopt', status: 'done' },
          { item: 'y', decision: 'skip', reason: 'n/a' },
        ],
      },
    };
    const input = { path: 'List.tsx', ...full, storySource: stories, evidence };
    assert.equal(certifyComponent(input).certified, true);
    assertCriteria(
      certifyComponent({
        ...input,
        evidence: {
          ...evidence,
          mutation: { ...evidence.mutation, score: 50, survived: 20 },
        },
      }),
      { mutation: 'fail' }
    );
    assertCriteria(
      certifyComponent({
        ...input,
        source: `${full.source}\n// changed`,
        evidence: {
          ...evidence,
          sourceHash: sourceHash(`${full.source}\n// changed`),
        },
      }),
      { benchmark: 'unknown' }
    );
  });

  it('certificate binding is computed from source rather than caller metadata', () => {
    assert.equal(
      certifyComponent({
        path: 'Card.tsx',
        source: clean,
        evidence: { sourceHash: 'invented' },
      }).binding,
      sourceHash(clean)
    );
  });

  it.each(['a11y', 'visual'])(
    '%s observations retain fresh failures and reject stale/unbound evidence',
    id => {
      for (const [binding, expected] of [
        [sourceHash(clean), 'fail'],
        [sourceHash('old'), 'unknown'],
        [undefined, 'unknown'],
      ]) {
        assertCriteria(
          certifyComponent({
            path: 'Card.tsx',
            source: clean,
            evidence: {
              [id]: {
                status: 'fail',
                sourceHash: binding,
                detail: 'observed failure',
              },
            },
          }),
          { [id]: expected }
        );
      }
    }
  );

  const mutationCase = (fields = {}, inputs = {}, status = 'unknown') => ({
    fields,
    inputs,
    status,
  });
  it.each([
    mutationCase({}, { mutationTestSources: null }),
    mutationCase({ sha: 'unknown' }),
    mutationCase({ blob: 'b'.repeat(40) }),
    ...['100', Infinity, NaN, -1, 101, null].map(score =>
      mutationCase({ score })
    ),
    ...[undefined, -1, 1.5, '10'].map(valid => mutationCase({ valid })),
    mutationCase({ score: 80, valid: 0 }, {}, 'pass'),
    mutationCase({ score: 79.5 }, {}, 'fail'),
  ])('mutation validation: %j', ({ inputs, fields, status }) => {
    assertCriteria(
      certifyComponent({
        path: 'Card.tsx',
        source: clean,
        ...inputs,
        evidence: { mutation: { ...mutationReceipt(clean), ...fields } },
      }),
      { mutation: status }
    );
  });

  it('waivers and certificate output preserve unresolved criteria', () => {
    const cert = certifyComponent({
      path: 'apps/web/components/molecules/List.tsx',
      ...full,
      storySource: 'export const Loading={};',
      waivers: {
        offline: 'static',
        empty: 'x',
        error: 'x',
        partial: 'x',
        'long-content': 'x',
        'permission-denied': 'x',
        'rtl-overflow': 'x',
      },
    });
    assert.equal(cert.criteria.find(c => c.id === 'states').status, 'pass');
    const report = buildReport({
      certificates: [cert],
      headSha: 'abc',
      now: 'T',
    });
    assert.equal(report.totals.components, 1);
    assert.equal(report.totals.certified, 0);
    const spec = renderAgentSpec(cert);
    assert.match(spec, /Missing criteria/);
    assert.match(spec, /component-certificate\.mjs --component/);
  });

  it('nested bordered surfaces: three levels flagged, flat surface is not', () => {
    const nested = `export const D = () => <div className="border rounded"><section className="border"><input className="border" /></section></div>;`;
    assert.ok(
      findJank(nested, 'a.tsx').some(f => f.rule === 'surface:nested-bordered')
    );
    const flat = `export const D = () => <div className="border rounded"><input className="bg-surface-1" /></div>;`;
    assert.ok(
      !findJank(flat, 'a.tsx').some(f => f.rule === 'surface:nested-bordered')
    );
  });

  it('defect-guard registry: every defect needs a guard; weekly human vs guard counts', () => {
    const defects = [
      ['human', '2026-10-25', 'lint-ast-rule', 'landed'],
      ['guard', '2026-10-26', 'search-relevance-fixture', 'planned'],
    ].map(([foundBy, foundAt, type, status], i) => ({
      id: `D${i}`,
      class: 'surface',
      foundBy,
      foundAt,
      guard: { type, ref: 'x', status },
    }));
    const ok = summarizeGuards({ defects });
    assert.deepEqual(ok.errors, []);
    assert.equal(ok.guardsLanded, 1);
    assert.deepEqual(ok.weeks['2026-W43'], { human: 1, guard: 0, agent: 0 });
    assert.equal(ok.weeks['2026-W44'].guard, 1);
    delete defects[0].guard;
    assert.equal(summarizeGuards({ defects }).errors.length, 1);
  });
});

describe('component certificate CLI evidence freshness', () => {
  const cli = fileURLToPath(
    new URL('../../component-certificate.mjs', import.meta.url)
  );
  const component = 'apps/web/components/molecules/Card.tsx';
  const testPath = component.replace('.tsx', '.test.tsx');
  const additionalTest = 'apps/web/tests/unit/Card.test.tsx';
  const original = 'export function Card() { return <div />; }\n';
  const changed =
    'export function Card() { return <div title="updated" />; }\n';

  let f;
  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), 'component-certificate-cli-'));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
    );
    const write = (path, value) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), value);
    };
    const json = (path, value) => write(path, JSON.stringify(value));
    const git = (args, options = {}) =>
      execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
        cwd: root,
        env,
        encoding: 'utf8',
        ...options,
      }).trim();
    const records = {};
    const save = () => {
      json('mutation.json', {
        modules: { [component.replace('apps/web/', '')]: records.mutation },
      });
      for (const kind of ['visual', 'a11y', 'benchmark'])
        json(`${kind}.json`, { components: { [component]: records[kind] } });
    };
    const refresh = () => {
      const binding = sourceHash(readFileSync(join(root, component), 'utf8'));
      records.mutation = {
        status: 'scored',
        score: 100,
        valid: 10,
        survived: 0,
        sha: git(['rev-parse', 'HEAD']),
        blob: moduleKey(git(['hash-object', component]), [
          git(['hash-object', testPath]),
          git(['hash-object', additionalTest]),
        ]),
      };
      records.visual = { status: 'pass', captured: 1, sourceHash: binding };
      records.a11y = { status: 'pass', sourceHash: binding };
      records.benchmark = { libraryVersion: 1, sourceHash: binding, gaps: [] };
      save();
    };
    const invoke = (entry = cli) => {
      const output = join(root, 'report.json');
      const result = spawnSync(
        process.execPath,
        [
          entry,
          '--repo-root',
          root,
          '--component',
          component,
          '--mutation-state',
          'mutation.json',
          '--visual',
          'visual.json',
          '--a11y',
          'a11y.json',
          '--benchmarks',
          'benchmark.json',
          '--out',
          output,
        ],
        { cwd: root, env, encoding: 'utf8' }
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return JSON.parse(readFileSync(output, 'utf8')).certificates[0];
    };
    f = { root, write, records, save, refresh, invoke, git };
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.name', 'Certificate fixture']);
    git(['config', 'user.email', 'certificate@example.invalid']);
    write(component, original);
    write(testPath, 'it("renders", () => { expect(1).toBe(1); });\n');
    write(additionalTest, 'it("additional", () => { expect(2).toBe(2); });\n');
    write(component.replace('.tsx', '.stories.tsx'), stories);
    git(['add', '.']);
    git(['commit', '-qm', 'component and tests']);
    refresh();
  });
  afterEach(() => rmSync(f.root, { recursive: true, force: true }));

  it('the CLI import closure works with only its existing TypeScript dependency', () => {
    for (const path of [
      'scripts/component-certificate.mjs',
      'scripts/component-ship-policy.mjs',
      'scripts/lib/component-certificate.mjs',
      'scripts/lib/mutation-sweep.mjs',
      'scripts/lib/mutation-diff.mjs',
    ]) {
      mkdirSync(dirname(join(f.root, path)), { recursive: true });
      cpSync(join(dirname(dirname(cli)), path), join(f.root, path));
    }
    mkdirSync(join(f.root, 'node_modules'));
    symlinkSync(
      dirname(fileURLToPath(import.meta.resolve('typescript/package.json'))),
      join(f.root, 'node_modules/typescript'),
      'dir'
    );
    assert.equal(
      f.invoke(join(f.root, 'scripts/component-certificate.mjs')).certified,
      true
    );
  });

  it('component edit and benchmark-only refresh cannot reuse old CI or mutation evidence', () => {
    assert.equal(f.invoke().certified, true);
    f.write(component, changed);
    f.records.benchmark.sourceHash = sourceHash(changed);
    f.save();
    assertCriteria(f.invoke(), {
      a11y: 'unknown',
      visual: 'unknown',
      mutation: 'unknown',
      benchmark: 'pass',
    });
    f.refresh();
    assert.equal(f.invoke().certified, true);
  });

  it.each([
    ['a11y', 'sourceHash'],
    ['visual', 'sourceHash'],
    ['mutation', 'blob'],
    ['mutation', 'sha'],
  ])('unbound %s evidence without %s remains unknown', (id, field) => {
    delete f.records[id][field];
    f.save();
    assertCriteria(f.invoke(), { [id]: 'unknown' });
  });

  it('non-colocated same-stem test edits invalidate the canonical mutation key', () => {
    f.write(additionalTest, 'it("changed", () => { expect(3).toBe(3); });\n');
    assertCriteria(f.invoke(), { mutation: 'unknown', visual: 'pass' });
    f.refresh();
    assert.equal(f.invoke().certified, true);
  });

  it('unchanged source/test mutation receipts remain reusable across unrelated revisions', () => {
    const measuredSha = f.records.mutation.sha;
    f.write('unrelated.txt', 'independent work\n');
    f.git(['add', 'unrelated.txt']);
    f.git(['commit', '-qm', 'unrelated revision']);
    assert.notEqual(f.git(['rev-parse', 'HEAD']), measuredSha);
    assert.equal(f.invoke().certified, true);
  });

  it('conflicting mutation source metadata cannot override its otherwise fresh key', () => {
    f.records.mutation.sourceHash = sourceHash(changed);
    f.save();
    assertCriteria(f.invoke(), { mutation: 'unknown' });
  });

  it('current unit axe evidence remains independent of a stale CI a11y receipt', () => {
    f.write(
      testPath,
      'it("axe", async () => { expect(1).toBe(1); await expectNoA11yViolations(container); });\n'
    );
    f.refresh();
    f.records.a11y.sourceHash = sourceHash(changed);
    f.save();
    const cert = f.invoke();
    assert.equal(criterion(cert, 'a11y').source, 'unit-axe');
    assert.equal(cert.certified, true);
  });

  it.each([additionalTest, '.git'])(
    'missing %s cannot reuse a partial mutation key',
    path => {
      rmSync(join(f.root, path), { recursive: true, force: true });
      assertCriteria(f.invoke(), { mutation: 'unknown', visual: 'pass' });
    }
  );

  it('fresh UTF-8 source uses the canonical Git blob byte length', () => {
    f.write(
      component,
      'export function Card() { return <div title="café 🎵" />; }\n'
    );
    f.refresh();
    assert.equal(f.invoke().certified, true);
  });

  it('a real Git inventory above 1 MiB retains complete mutation evidence', () => {
    const blob = f.git(['hash-object', '-w', component]);
    const rows = Array.from(
      { length: 12000 },
      (_, i) =>
        `100644 ${blob}\tapps/web/fixtures/${'inventory-'.repeat(8)}${i}.txt\0`
    ).join('');
    f.git(['update-index', '-z', '--index-info'], { input: rows });
    const inventory = f.git(['ls-files', '-z', '--', 'apps/web'], {
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.ok(Buffer.byteLength(inventory) > 1024 * 1024);
    assert.equal(f.invoke().certified, true);
  });
});
