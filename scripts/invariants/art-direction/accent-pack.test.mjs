import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ruleOf, surfaceOf, walkSources } from './accent-pack.mjs';
import { expectedAccent, GREEN_RED_MIN_SET } from './accent-pack-config.mjs';
import { figmaSnapshotIds, scanSource } from './accent-pack-lib.mjs';
import { evaluateRatchet } from './ratchet.mjs';

const OPTS = {
  allowedHex: [
    '#11afff',
    '#8e56f5',
    '#f52bb5',
    '#3ffa8b',
    '#ff7800',
    '#f72a36',
  ],
};
const run = (src, file = 'apps/web/components/Demo.tsx', extra = {}) =>
  scanSource(src, file, { ...OPTS, ...extra });
const rules = ids => ids.map(ruleOf);
const has = (ids, rule) => rules(ids).includes(rule);

describe('threshold constant', () => {
  it('is 6 for both green and red', () => assert.equal(GREEN_RED_MIN_SET, 6));
  it('sets of 5 or fewer rotate ion, ultra, pulse, orange and wrap', () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4].map(i => expectedAccent(i, 5)),
      ['ion', 'ultra', 'pulse', 'orange', 'ion']
    );
    assert.equal(expectedAccent(4, 6), 'mint');
    assert.equal(expectedAccent(5, 6), 'red');
  });
});

describe('(a) off-pack color', () => {
  it('flags a Tailwind palette color', () => {
    const ids = run(
      'export const A = () => <div className="text-red-500 border-teal-300" />;'
    );
    assert.ok(
      ids.includes(
        'off-pack-tailwind:apps/web/components/Demo.tsx:text-red-500'
      )
    );
    assert.ok(
      ids.includes(
        'off-pack-tailwind:apps/web/components/Demo.tsx:border-teal-300'
      )
    );
  });
  it('passes neutrals and pack tokens', () => {
    const ids = run(
      'export const A = () => <div className="text-neutral-500 bg-zinc-900 text-primary-token border-subtle" />;'
    );
    assert.deepEqual(ids, []);
  });
  it('flags a raw accent-like literal in style but not a pack hex or a neutral', () => {
    const bad = run(
      `export const A = () => <div style={{ color: '#1db954' }} />;`
    );
    assert.ok(has(bad, 'off-pack-literal'));
    const ok = run(
      `export const A = () => <div style={{ borderColor: '#11afff', color: '#9da2ac' }} />;`
    );
    assert.deepEqual(ok, []);
  });
  it('flags geist variables but not the pack variables', () => {
    assert.ok(
      has(
        run(`const a = 'var(--geist-amber-solid)';`, 'apps/web/lib/x.ts'),
        'off-pack-var'
      )
    );
    assert.deepEqual(
      run(`const a = 'var(--color-accent-blue)';`, 'apps/web/lib/x.ts'),
      []
    );
  });
  it('skips (a) in a token source file', () => {
    const ids = run(
      '.a{color:var(--geist-amber-solid)}',
      'apps/web/styles/design-system.css',
      { tokenSource: true }
    );
    assert.deepEqual(ids, []);
  });
});

describe('(b) two-tone gradient', () => {
  it('fails Tailwind stops from two hues', () => {
    assert.ok(
      has(
        run(
          'const c = "bg-gradient-to-r from-blue-500 to-purple-500";',
          'apps/web/lib/g.ts'
        ),
        'two-tone-gradient'
      )
    );
    assert.ok(
      has(
        run(
          'const c = "bg-gradient-to-r from-[#11afff] to-[#f52bb5]";',
          'apps/web/lib/g.ts'
        ),
        'two-tone-gradient'
      )
    );
  });
  it('fails a CSS gradient that mixes two accents', () => {
    assert.ok(
      has(
        run(
          '.a{background:linear-gradient(90deg,var(--color-accent-blue),var(--color-accent-pink))}',
          'apps/web/styles/a.css'
        ),
        'two-tone-gradient'
      )
    );
  });
  it('passes one hue in several shades and neutral stops', () => {
    const ids = run(
      'const c = "bg-gradient-to-r from-[#11afff] via-[#0b6fa6] to-transparent";',
      'apps/web/lib/g.ts'
    );
    assert.ok(!has(ids, 'two-tone-gradient'));
    const css = run(
      '.a{background:radial-gradient(circle,rgba(17,175,255,.4),#030406)}',
      'apps/web/styles/a.css'
    );
    assert.ok(!has(css, 'two-tone-gradient'));
  });
});

describe('(b) gradients sit on one accent hue', () => {
  const css = (decl, extra) =>
    run(`.a{${decl}}`, 'apps/web/styles/a.css', extra);
  it('passes neutral-only gradients', () => {
    assert.deepEqual(
      css('background:linear-gradient(#030406,#1a1b1e,rgba(255,255,255,.04))'),
      []
    );
    assert.deepEqual(
      run(
        'const c = "bg-gradient-to-b from-black via-neutral-900 to-transparent";',
        'apps/web/lib/g.ts'
      ),
      []
    );
  });
  it('passes one accent mixed with transparent, black, white or its own shades', () => {
    assert.deepEqual(
      css(
        'background:radial-gradient(circle,var(--color-accent-blue),transparent)'
      ),
      []
    );
    assert.deepEqual(
      css('background:linear-gradient(#11afff,#0b6fa6,#030406)'),
      []
    );
    assert.deepEqual(
      css(
        'background:linear-gradient(color-mix(in oklab,var(--color-accent-pink) 20%,white),transparent)'
      ),
      []
    );
    assert.deepEqual(
      run(
        'const c = "from-[#11afff] via-[#7fd0ff] to-black";',
        'apps/web/lib/g.ts'
      ),
      []
    );
  });
  it('fails a gradient whose stop drifts off the accent hue', () => {
    assert.ok(
      has(
        css('background:linear-gradient(#0070f3,transparent)'),
        'gradient-off-hue'
      )
    );
    assert.ok(
      has(
        run('const c = "from-blue-500 to-transparent";', 'apps/web/lib/g.ts'),
        'gradient-off-hue'
      )
    );
  });
  it('fails a two-accent gradient in CSS, Tailwind and inline style', () => {
    assert.ok(
      has(
        css('background:linear-gradient(#11afff,#8e56f5)'),
        'two-tone-gradient'
      )
    );
    assert.ok(
      has(
        run(
          'const c = "from-accent-blue to-accent-purple";',
          'apps/web/lib/g.ts'
        ),
        'two-tone-gradient'
      )
    );
    assert.ok(
      has(
        run(
          `export const A = () => <div style={{ backgroundImage: 'linear-gradient(90deg, #f52bb5, #ff7800)' }} />;`
        ),
        'two-tone-gradient'
      )
    );
  });
  it('checks SVG gradient stops', () => {
    const bad = `export const S = () => <svg><linearGradient id="g"><stop offset="0" stopColor="#11afff" /><stop offset="1" stopColor="#f52bb5" /></linearGradient></svg>;`;
    assert.ok(has(run(bad), 'two-tone-gradient'));
    const ok = `export const S = () => <svg><radialGradient id="g"><stop offset="0" stopColor="#11afff" /><stop offset="1" stopColor="#030406" /></radialGradient></svg>;`;
    assert.deepEqual(run(ok), []);
  });
  it('lets an allowlisted, justified two-accent gradient through', () => {
    const file = 'apps/web/styles/a.css';
    const allow = [
      { file, reason: 'paired state ramp', stops: ['ion', 'ultra'] },
    ];
    assert.deepEqual(
      css('background:linear-gradient(#11afff,#8e56f5)', {
        gradientAllow: allow,
      }),
      []
    );
    const noReason = [{ file, reason: '', stops: ['ion', 'ultra'] }];
    assert.ok(
      has(
        css('background:linear-gradient(#11afff,#8e56f5)', {
          gradientAllow: noReason,
        }),
        'two-tone-gradient'
      )
    );
    const otherPair = [{ file, reason: 'x', stops: ['ion', 'pulse'] }];
    assert.ok(
      has(
        css('background:linear-gradient(#11afff,#8e56f5)', {
          gradientAllow: otherPair,
        }),
        'two-tone-gradient'
      )
    );
  });
});

describe('(c) order and adjacency', () => {
  it('passes the fixed order and its prefixes', () => {
    for (const seq of [
      ['ion', 'ultra', 'pulse'],
      ['ion', 'ultra', 'pulse', 'orange'],
      ['ion', 'ultra', 'pulse', 'orange', 'mint', 'red'],
    ])
      assert.deepEqual(
        run(`export const RING = ${JSON.stringify(seq)};`, 'apps/web/lib/r.ts'),
        []
      );
  });
  it('fails a rotation that starts with pulse', () => {
    const ids = run(
      `export const RING = ['pulse', 'ion', 'ultra'];`,
      'apps/web/lib/r.ts'
    );
    assert.ok(has(ids, 'rotation-order'));
  });
  it('fails orange before pulse and adjacent repeats', () => {
    assert.ok(
      has(
        run(
          `export const RING = ['ion', 'orange', 'pulse'];`,
          'apps/web/lib/r.ts'
        ),
        'rotation-order'
      )
    );
    assert.ok(
      has(
        run(
          `export const RING = ['ion', 'ion', 'ultra'];`,
          'apps/web/lib/r.ts'
        ),
        'adjacent-accent'
      )
    );
  });
  it('ignores neutrals at the head and status lookups', () => {
    assert.deepEqual(
      run(
        `export const RING = ['gray', 'blue', 'purple', 'pink'];`,
        'apps/web/lib/r.ts'
      ),
      []
    );
    assert.deepEqual(
      run(
        `export const STATUS_TONES = ['green', 'orange', 'red'];`,
        'apps/web/lib/r.ts'
      ),
      []
    );
  });
});

describe('(d) one accent per item and per section', () => {
  it('passes a spec grid that rotates per item', () => {
    const src = `
const ACCENTS = ['ion', 'ultra', 'pulse', 'orange'];
export function Grid({ items }) {
  return items.map((item, i) => <div key={item.id} data-accent={ACCENTS[i % ACCENTS.length]}>{item.title}</div>);
}`;
    assert.deepEqual(run(src), []);
  });
  it('passes a carousel that rotates per item', () => {
    const src = `
const RING = ['ion', 'ultra', 'pulse'];
export const Carousel = ({ slides }) => (
  <ul>{slides.map((s, i) => <li key={s.id} data-accent={RING[i % 3]} className="border border-subtle">{s.title}</li>)}</ul>
);`;
    assert.deepEqual(run(src), []);
  });
  it('fails one card with two accents', () => {
    const ids = run(
      `export const C = () => <div className="bg-accent-blue/10 border-t-2 bg-accent-pink/10" />;`
    );
    assert.ok(has(ids, 'multi-accent-item'));
  });
  it('fails hardcoded different accents on sibling sections that are not a rotation', () => {
    const ids = run(
      `export const P = () => (<><section className="bg-accent-blue/10" /><section className="bg-accent-pink/10" /></>);`
    );
    assert.ok(has(ids, 'multi-accent-file'));
  });
  it('lets data-viz paths carry several hardcoded series', () => {
    const src = `export const C = () => (<><i className="bg-accent-blue/10" /><i className="bg-accent-pink/10" /></>);`;
    assert.ok(
      !has(
        run(src, 'apps/web/components/charts/SeriesLegend.tsx'),
        'multi-accent-file'
      )
    );
  });
});

describe('(e) green and red minimum set', () => {
  it('fails a 3-item grid that uses mint', () => {
    const src = `export const ITEMS = [{ title: 'a', accent: 'ion' }, { title: 'b', accent: 'ultra' }, { title: 'c', accent: 'mint' }];`;
    assert.ok(has(run(src, 'apps/web/lib/i.ts'), 'mint-red-min-set'));
  });
  it('fails a 4-item and a 5-item rotation that reaches mint', () => {
    assert.ok(
      has(
        run(
          `export const R = ['ion', 'ultra', 'pulse', 'mint'];`,
          'apps/web/lib/i.ts'
        ),
        'mint-red-min-set'
      )
    );
    assert.ok(
      has(
        run(
          `export const R = ['ion', 'ultra', 'pulse', 'orange', 'mint'];`,
          'apps/web/lib/i.ts'
        ),
        'mint-red-min-set'
      )
    );
  });
  it('passes a 5-item rotation that wraps to ion', () => {
    assert.deepEqual(
      run(
        `export const R = ['ion', 'ultra', 'pulse', 'orange', 'ion'];`,
        'apps/web/lib/i.ts'
      ),
      []
    );
  });
  it('passes a 6-item chart that reaches red', () => {
    const src = `export const SERIES = [
  { id: 'a', accent: 'ion' }, { id: 'b', accent: 'ultra' }, { id: 'c', accent: 'pulse' },
  { id: 'd', accent: 'orange' }, { id: 'e', accent: 'mint' }, { id: 'f', accent: 'red' }];`;
    assert.deepEqual(run(src, 'apps/web/components/charts/series.ts'), []);
  });
  it('requires a dynamic helper to name the threshold', () => {
    const bad = `export function getRotationAccent(i) { return ['ion','ultra','pulse','orange','mint','red'][i % 6]; }`;
    assert.ok(
      has(run(bad, 'apps/web/lib/h.ts'), 'rotation-helper-no-threshold')
    );
    const good = `import { GREEN_RED_MIN_SET } from './c';
export function getRotationAccent(i, size) { const pool = size >= GREEN_RED_MIN_SET ? ['ion','ultra','pulse','orange','mint','red'] : ['ion','ultra','pulse','orange']; return pool[i % pool.length]; }`;
    assert.deepEqual(run(good, 'apps/web/lib/h.ts'), []);
  });
  it('flags an unguarded dynamic palette that contains mint', () => {
    const src = `const PALETTE = ['ion','ultra','pulse','orange','mint','red'];
export const pick = i => PALETTE[i % PALETTE.length];`;
    assert.ok(has(run(src, 'apps/web/lib/p.ts'), 'mint-red-unguarded'));
  });
  it('exempts status components by variant, not by path', () => {
    const src = `export const B = ({ status }) => <span data-status={status} className="bg-accent-green/10" />;`;
    assert.ok(
      !has(run(src, 'apps/web/components/Thing.tsx'), 'mint-red-min-set')
    );
    const decor = `export const B = () => <div className="bg-accent-green/10" />;`;
    assert.ok(
      has(run(decor, 'apps/web/components/Thing.tsx'), 'mint-red-min-set')
    );
  });
});

describe('(f) equal weight', () => {
  it('fails mixed soft and solid fills across peers', () => {
    const src = `export const PEER_FILLS = ['bg-accent-blue/10', 'bg-accent-purple', 'bg-accent-pink/10'];`;
    assert.ok(has(run(src, 'apps/web/lib/w.ts'), 'unequal-weight'));
  });
  it('fails mixed opacities and passes one step', () => {
    assert.ok(
      has(
        run(
          `export const PEER_FILLS = ['bg-accent-blue/10', 'bg-accent-purple/20', 'bg-accent-pink/10'];`,
          'apps/web/lib/w.ts'
        ),
        'unequal-weight'
      )
    );
    assert.ok(
      !has(
        run(
          `export const PEER_FILLS = ['bg-accent-blue/10', 'bg-accent-purple/10', 'bg-accent-pink/10'];`,
          'apps/web/lib/w.ts'
        ),
        'unequal-weight'
      )
    );
  });
});

describe('(g) solid fills on containers', () => {
  it('fails a full-strength accent fill on a card, section or button', () => {
    for (const tag of ['div', 'section', 'button'])
      assert.ok(
        has(
          run(
            `export const A = () => <${tag} className="bg-accent-blue p-4" />;`
          ),
          'solid-accent-fill'
        ),
        tag
      );
    assert.ok(
      has(
        run(
          `export const A = () => <div style={{ background: '#8e56f5' }} />;`
        ),
        'solid-accent-fill'
      )
    );
  });
  it('passes soft tints, strokes, rings, glows and small dots', () => {
    const src = `export const A = () => (<div className="bg-accent-blue/10 border border-accent-blue ring-1 ring-accent-blue shadow-accent-blue"><span className="size-2 rounded-full bg-accent-pink" /></div>);`;
    assert.ok(!has(run(src), 'solid-accent-fill'));
  });
  it('passes a status badge and chart marks', () => {
    assert.ok(
      !has(
        run(
          `export const A = ({ status }) => <div data-status={status} className="bg-accent-green" />;`
        ),
        'solid-accent-fill'
      )
    );
    assert.ok(
      !has(
        run(
          `export const A = () => <div className="bg-accent-blue h-3" />;`,
          'apps/web/components/charts/Bar.tsx'
        ),
        'solid-accent-fill'
      )
    );
  });
});

describe('ratchet', () => {
  it('fails on growth and on a stale baseline', () => {
    assert.ok(
      evaluateRatchet({ current: ['a', 'b'], recorded: ['a'], ancestor: null })
        .length > 0
    );
    assert.ok(
      evaluateRatchet({ current: ['a'], recorded: ['a', 'b'], ancestor: null })
        .length > 0
    );
    assert.deepEqual(
      evaluateRatchet({
        current: ['a'],
        recorded: ['a'],
        ancestor: ['a', 'b'],
      }),
      []
    );
  });
});

describe('coverage: nothing escapes', () => {
  it('flags off-pack literals in an email template string', () => {
    const bad =
      'export const html = `<td style="background:#1db954;color:#ffffff">hi</td>`;';
    assert.ok(
      has(
        run(bad, 'apps/web/lib/email/templates/welcome.ts'),
        'off-pack-literal'
      )
    );
    const ok =
      'export const html = `<td style="background:#030406;color:#f7f8f8">hi</td>`;';
    assert.deepEqual(run(ok, 'apps/web/lib/email/templates/welcome.ts'), []);
  });
  it('flags off-pack literals in an ImageResponse route', () => {
    const bad =
      "import { ImageResponse } from 'next/og';\nexport const BG = '#ff0080';";
    assert.ok(
      has(
        run(bad, 'apps/web/app/brand/opengraph-image.tsx'),
        'off-pack-literal'
      )
    );
    assert.deepEqual(
      run(
        "import { ImageResponse } from 'next/og';\nexport const BG = '#11afff';",
        'apps/web/app/brand/opengraph-image.tsx'
      ),
      []
    );
  });
  it('checks the Figma snapshot: pack and neutral pass, off-pack fails', () => {
    const allowed = ['#11afff'];
    const good = {
      variables: {
        'surface/canvas': { values: { dark: '#030406' } },
        'accent/ion': { values: { dark: '#11afff' } },
        'border/strong': { values: { dark: '#c7edff' } },
      },
    };
    assert.deepEqual(figmaSnapshotIds(good, 'f.json', allowed), []);
    const bad = {
      variables: { 'accent/amber': { values: { dark: '#f5a623' } } },
    };
    assert.equal(figmaSnapshotIds(bad, 'f.json', allowed).length, 1);
  });
  it('walks stories and .storybook but not tests', () => {
    const root = mkdtempSync(join(tmpdir(), 'accent-pack-'));
    mkdirSync(join(root, 'apps/web/.storybook'), { recursive: true });
    mkdirSync(join(root, 'apps/web/components'), { recursive: true });
    for (const f of [
      'apps/web/.storybook/preview.tsx',
      'apps/web/components/A.stories.tsx',
      'apps/web/components/A.test.tsx',
      'apps/web/components/A.tsx',
    ])
      writeFileSync(join(root, f), 'export {};');
    const found = walkSources(root, ['apps/web'])
      .map(f => f.slice(root.length + 1))
      .sort();
    assert.deepEqual(found, [
      'apps/web/.storybook/preview.tsx',
      'apps/web/components/A.stories.tsx',
      'apps/web/components/A.tsx',
    ]);
  });
  it('names a surface for stories, emails, OG, figma and other apps', () => {
    assert.match(surfaceOf('apps/web/components/A.stories.tsx'), /Storybook/);
    assert.match(surfaceOf('apps/web/lib/email/templates/a.ts'), /Emails/);
    assert.match(
      surfaceOf('apps/web/app/[username]/opengraph-image.tsx'),
      /OG/
    );
    assert.match(
      surfaceOf('docs/design/figma/figma-variables.snapshot.json'),
      /Figma/
    );
    assert.match(surfaceOf('apps/console/app/page.tsx'), /Other apps/);
  });
});
