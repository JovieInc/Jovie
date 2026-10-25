import assert from 'node:assert/strict';
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
    const evidence = {
      sourceHash: 'h',
      mutation: { status: 'scored', score: 90, valid: 40, survived: 4 },
      visual: { status: 'pass', captured: 5 },
      benchmark: {
        libraryVersion: 1,
        sourceHash: 'h',
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
        mutation: { status: 'scored', score: 50, valid: 40, survived: 20 },
      },
    });
    assert.equal(low.certified, false);
    const stale = certifyComponent({
      path: 'apps/web/components/molecules/List.tsx',
      ...full,
      storySource,
      evidence: { ...evidence, sourceHash: 'changed' },
    });
    assert.equal(
      stale.criteria.find(c => c.id === 'benchmark').status,
      'unknown'
    );
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
