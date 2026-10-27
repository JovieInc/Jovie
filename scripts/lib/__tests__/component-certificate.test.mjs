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
import { describe, it } from 'vitest';
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

describe('component certificate', () => {
  const clean = `export function Card({ title }: { title: string }) { return <div className="bg-surface-1 text-primary-token">{title}</div>; }`;

  it('raw colours: palette, hex and colour functions are flagged; tokens are not', () => {
    assert.equal(findRawColors(clean, 'a.tsx').length, 0);
    const kinds = findRawColors(
      `const a = "bg-blue-500 text-white"; const b = '#fff'; const c = "rgb(1,2,3)";`,
      'a.tsx'
    ).map(h => h.kind);
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
    const mutation = {
      status: 'scored',
      score: 90,
      valid: 40,
      survived: 4,
      sha: 'a'.repeat(40),
      blob: moduleKey(gitBlob(full.source), [gitBlob(full.testSource)]),
    };
    const evidence = {
      sourceHash: binding,
      mutation,
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
    const storySource =
      'export const Loading={}; export const Empty={}; export const Error={}; export const Partial={}; export const LongContent={}; export const Offline={}; export const PermissionDenied={}; export const Rtl={};';
    const ok = certifyComponent({
      path: 'apps/web/components/molecules/List.tsx',
      ...full,
      storySource,
      evidence,
      waivers: {},
    });
    assert.equal(ok.certified, true, JSON.stringify(ok.missing));
    const low = certifyComponent({
      path: 'apps/web/components/molecules/List.tsx',
      ...full,
      storySource,
      evidence: {
        ...evidence,
        mutation: { ...mutation, score: 50, survived: 20 },
      },
    });
    assert.equal(low.certified, false);
    const stale = certifyComponent({
      path: 'apps/web/components/molecules/List.tsx',
      ...full,
      source: `${full.source}\n// changed source`,
      storySource,
      evidence: {
        ...evidence,
        sourceHash: sourceHash(`${full.source}\n// changed source`),
      },
    });
    assert.equal(
      stale.criteria.find(c => c.id === 'benchmark').status,
      'unknown'
    );
  });

  it('certificate binding is computed from source rather than caller metadata', () => {
    const cert = certifyComponent({
      path: 'Card.tsx',
      source: clean,
      evidence: { sourceHash: 'invented' },
    });
    assert.equal(cert.binding, sourceHash(clean));
  });

  it('fresh failed observations stay failed; stale or unbound observations are unknown', () => {
    for (const id of ['a11y', 'visual']) {
      for (const [binding, expected] of [
        [sourceHash(clean), 'fail'],
        [sourceHash('old source'), 'unknown'],
        [undefined, 'unknown'],
      ]) {
        const cert = certifyComponent({
          path: 'Card.tsx',
          source: clean,
          evidence: {
            [id]: {
              status: 'fail',
              sourceHash: binding,
              detail: 'observed failure',
            },
          },
        });
        assert.equal(
          cert.criteria.find(row => row.id === id).status,
          expected,
          id
        );
        assert.ok(cert.missing.some(row => row.criterion === id));
      }
    }
  });

  it('mutation receipts require a known run and complete current test inputs', () => {
    const evidence = {
      mutation: {
        status: 'scored',
        score: 100,
        valid: 5,
        sha: 'a'.repeat(40),
        blob: moduleKey(gitBlob(clean), []),
      },
    };
    for (const override of [
      { mutationTestSources: null },
      { evidence: { mutation: { ...evidence.mutation, sha: 'unknown' } } },
      {
        evidence: { mutation: { ...evidence.mutation, blob: 'b'.repeat(40) } },
      },
    ]) {
      const cert = certifyComponent({
        path: 'Card.tsx',
        source: clean,
        evidence,
        ...override,
      });
      assert.equal(
        cert.criteria.find(row => row.id === 'mutation').status,
        'unknown'
      );
    }
  });

  it('fresh-bound malformed mutation measurements stay unknown without changing the score floor', () => {
    const mutation = {
      status: 'scored',
      score: 100,
      valid: 10,
      sha: 'a'.repeat(40),
      blob: moduleKey(gitBlob(clean), []),
    };
    for (const fields of [
      { score: '100' },
      { score: Infinity },
      { score: NaN },
      { score: -1 },
      { score: 101 },
      { score: null },
      { valid: undefined },
      { valid: -1 },
      { valid: 1.5 },
      { valid: '10' },
    ]) {
      const cert = certifyComponent({
        path: 'Card.tsx',
        source: clean,
        evidence: { mutation: { ...mutation, ...fields } },
      });
      assert.equal(
        cert.criteria.find(row => row.id === 'mutation').status,
        'unknown'
      );
      assert.ok(cert.missing.some(row => row.criterion === 'mutation'));
    }
    for (const [score, valid, expected] of [
      [80, 0, 'pass'],
      [79.5, 10, 'fail'],
    ]) {
      const cert = certifyComponent({
        path: 'Card.tsx',
        source: clean,
        evidence: { mutation: { ...mutation, score, valid } },
      });
      assert.equal(
        cert.criteria.find(row => row.id === 'mutation').status,
        expected
      );
    }
  });

  it('waiver with a reason satisfies a state; report totals and agent spec', () => {
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
    const ok = summarizeGuards({
      defects: [
        {
          id: 'D1',
          class: 'surface',
          foundBy: 'human',
          foundAt: '2026-10-25T00:00:00Z',
          guard: {
            type: 'lint-ast-rule',
            ref: 'surface:nested-bordered',
            status: 'landed',
          },
        },
        {
          id: 'D2',
          class: 'search',
          foundBy: 'guard',
          foundAt: '2026-10-26T00:00:00Z',
          guard: {
            type: 'search-relevance-fixture',
            ref: 'x',
            status: 'planned',
          },
        },
      ],
    });
    assert.deepEqual(ok.errors, []);
    assert.equal(ok.guardsLanded, 1);
    assert.deepEqual(ok.weeks['2026-W43'], { human: 1, guard: 0, agent: 0 });
    assert.equal(ok.weeks['2026-W44'].guard, 1);
    assert.equal(
      summarizeGuards({
        defects: [
          {
            id: 'D3',
            class: 'c',
            foundBy: 'human',
            foundAt: '2026-10-25T00:00:00Z',
          },
        ],
      }).errors.length,
      1
    );
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

  it('the CLI import closure works with only its existing TypeScript dependency', () => {
    const root = mkdtempSync(join(tmpdir(), 'component-certificate-imports-'));
    const sourceRoot = dirname(dirname(cli));
    try {
      for (const path of [
        'scripts/component-certificate.mjs',
        'scripts/component-ship-policy.mjs',
        'scripts/lib/component-certificate.mjs',
        'scripts/lib/mutation-sweep.mjs',
        'scripts/lib/mutation-diff.mjs',
      ]) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        cpSync(join(sourceRoot, path), join(root, path));
      }
      mkdirSync(join(root, 'node_modules'));
      symlinkSync(
        dirname(fileURLToPath(import.meta.resolve('typescript/package.json'))),
        join(root, 'node_modules/typescript'),
        'dir'
      );
      const result = spawnSync(
        process.execPath,
        [
          join(root, 'scripts/component-certificate.mjs'),
          '--repo-root',
          root,
          '--all',
          '--summary',
        ],
        { cwd: root, encoding: 'utf8' }
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /components 0, certified 0/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function fixture(run) {
    const root = mkdtempSync(join(tmpdir(), 'component-certificate-cli-'));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
    );
    const write = (path, value) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), value);
    };
    const json = (path, value) => write(path, JSON.stringify(value));
    const git = (...args) =>
      execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
        cwd: root,
        env,
        encoding: 'utf8',
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
        sha: git('rev-parse', 'HEAD'),
        blob: moduleKey(git('hash-object', component), [
          git('hash-object', testPath),
          git('hash-object', additionalTest),
        ]),
      };
      records.visual = { status: 'pass', captured: 1, sourceHash: binding };
      records.a11y = { status: 'pass', sourceHash: binding };
      records.benchmark = { libraryVersion: 1, sourceHash: binding, gaps: [] };
      save();
    };
    const invoke = () => {
      const output = join(root, 'report.json');
      const result = spawnSync(
        process.execPath,
        [
          cli,
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
    try {
      git('init', '-q', '-b', 'main');
      git('config', 'user.name', 'Certificate fixture');
      git('config', 'user.email', 'certificate@example.invalid');
      write(component, original);
      write(testPath, 'it("renders", () => { expect(1).toBe(1); });\n');
      write(
        additionalTest,
        'it("additional assertion", () => { expect(2).toBe(2); });\n'
      );
      write(
        component.replace('.tsx', '.stories.tsx'),
        'export const Loading={}; export const Empty={}; export const Error={}; export const Partial={}; export const LongContent={}; export const Offline={}; export const PermissionDenied={}; export const Rtl={};\n'
      );
      git('add', '.');
      git('commit', '-qm', 'component and tests');
      refresh();
      run({ root, write, records, save, refresh, invoke, git });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('component edit and benchmark-only refresh cannot reuse old CI or mutation evidence', () => {
    fixture(f => {
      assert.equal(f.invoke().certified, true);
      f.write(component, changed);
      f.records.benchmark.sourceHash = sourceHash(changed);
      f.save();
      const stale = f.invoke();
      assert.equal(stale.certified, false);
      for (const id of ['a11y', 'visual', 'mutation']) {
        assert.equal(
          stale.criteria.find(row => row.id === id).status,
          'unknown',
          id
        );
        assert.ok(
          stale.missing.some(row => row.criterion === id),
          id
        );
      }
      assert.equal(
        stale.criteria.find(row => row.id === 'benchmark').status,
        'pass'
      );
      f.refresh();
      assert.equal(f.invoke().certified, true);
    });
  });

  for (const [criterion, field] of [
    ['a11y', 'sourceHash'],
    ['visual', 'sourceHash'],
    ['mutation', 'blob'],
    ['mutation', 'sha'],
  ]) {
    it(`unbound ${criterion} evidence without ${field} remains unknown`, () => {
      fixture(f => {
        delete f.records[criterion][field];
        f.save();
        const cert = f.invoke();
        assert.equal(cert.certified, false);
        assert.equal(
          cert.criteria.find(row => row.id === criterion).status,
          'unknown'
        );
      });
    });
  }

  it('same-stem test edits invalidate the canonical mutation key, including non-colocated tests', () => {
    fixture(f => {
      f.write(
        additionalTest,
        'it("changed assertion", () => { expect(3).toBe(3); });\n'
      );
      const stale = f.invoke();
      assert.equal(
        stale.criteria.find(row => row.id === 'mutation').status,
        'unknown'
      );
      assert.equal(
        stale.criteria.find(row => row.id === 'visual').status,
        'pass'
      );
      f.refresh();
      assert.equal(f.invoke().certified, true);
    });
  });

  it('unchanged source/test mutation receipts remain reusable across unrelated revisions', () => {
    fixture(f => {
      const measuredSha = f.records.mutation.sha;
      f.write('unrelated.txt', 'independent work\n');
      f.git('add', 'unrelated.txt');
      f.git('commit', '-qm', 'unrelated revision');
      assert.notEqual(f.git('rev-parse', 'HEAD'), measuredSha);
      assert.equal(f.invoke().certified, true);
    });
  });

  it('conflicting mutation source metadata cannot override its otherwise fresh key', () => {
    fixture(f => {
      f.records.mutation.sourceHash = sourceHash(changed);
      f.save();
      const cert = f.invoke();
      assert.equal(
        cert.criteria.find(row => row.id === 'mutation').status,
        'unknown'
      );
      assert.equal(cert.certified, false);
    });
  });

  it('current unit axe evidence remains independent of a stale CI a11y receipt', () => {
    fixture(f => {
      f.write(
        testPath,
        'it("axe", async () => { expect(1).toBe(1); await expectNoA11yViolations(container); });\n'
      );
      f.refresh();
      f.records.a11y.sourceHash = sourceHash(changed);
      f.save();
      const cert = f.invoke();
      assert.equal(
        cert.criteria.find(row => row.id === 'a11y').source,
        'unit-axe'
      );
      assert.equal(cert.certified, true);
    });
  });

  it('missing tracked tests or Git inventory cannot reuse a partial mutation key', () => {
    fixture(f => {
      rmSync(join(f.root, additionalTest));
      const missingTest = f.invoke();
      assert.equal(
        missingTest.criteria.find(row => row.id === 'mutation').status,
        'unknown'
      );
      assert.equal(missingTest.certified, false);
      rmSync(join(f.root, '.git'), { recursive: true, force: true });
      const missingGit = f.invoke();
      assert.equal(
        missingGit.criteria.find(row => row.id === 'mutation').status,
        'unknown'
      );
      assert.equal(
        missingGit.criteria.find(row => row.id === 'visual').status,
        'pass'
      );
    });
  });

  it('fresh UTF-8 source uses the canonical Git blob byte length', () => {
    fixture(f => {
      f.write(
        component,
        'export function Card() { return <div title="café 🎵" />; }\n'
      );
      f.refresh();
      assert.equal(f.invoke().certified, true);
    });
  });
});
