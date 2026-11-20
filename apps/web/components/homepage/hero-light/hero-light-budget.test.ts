import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  HERO_LIGHT_PERF,
  HERO_LIGHT_SCENE,
  HERO_LIGHT_WEBGL_RULE,
  heroLightWebGLExceptionViolations,
} from './hero-light-gate';

const DIR = join(__dirname);

function transpiledGzipBytes(file: string): number {
  const source = readFileSync(join(DIR, file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return gzipSync(outputText, { level: 9 }).byteLength;
}

function cssBlock(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  const end = source.indexOf('\n}', start);
  return source.slice(start, end);
}

/** Brace-balanced block for a selector or at-rule (media queries nest). */
function balancedBlock(source: string, opener: string): string {
  const start = source.indexOf(opener);
  if (start < 0) throw new Error(`missing ${opener}`);
  const openBrace = source.indexOf('{', start);
  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces for ${opener}`);
}

describe('homepage hero light budget', () => {
  it('keeps the WebGL chunk and the island inside their gzip budgets', () => {
    expect(transpiledGzipBytes('hero-light-gl.ts')).toBeLessThanOrEqual(
      HERO_LIGHT_PERF.glChunkGzipBytes
    );
    expect(transpiledGzipBytes('HomepageHeroLight.tsx')).toBeLessThanOrEqual(
      HERO_LIGHT_PERF.islandGzipBytes
    );
  });

  it('loads the GL layer lazily, never as a static import', () => {
    const island = readFileSync(join(DIR, 'HomepageHeroLight.tsx'), 'utf8');
    const staticImports = island.match(
      /^import\s+(?!type\b)[^;]*from\s+['"]\.\/hero-light-gl['"]/gm
    );
    expect(staticImports).toBeNull();
    expect(island).toContain("import('./hero-light-gl')");
  });

  it('uses the cinematic canvas and scene accent tokens, with Ultra and Pulse on the edge', () => {
    const css = readFileSync(join(DIR, 'HomepageHeroLight.css'), 'utf8');
    expect(css).toContain(
      '--hero-light-canvas: var(--system-b-cinematic-black, #06070a);'
    );
    for (const role of ['ion', 'ultra', 'pulse'] as const) {
      expect(css).toContain(
        `--hero-light-${role}: var(--noir-ion-${role}, ${HERO_LIGHT_SCENE[role].toLowerCase()});`
      );
    }
    expect(css.toLowerCase()).not.toMatch(/#ff7800|#ffa500|orange/);
    expect(css).not.toMatch(/\bblur\(|box-shadow:/);
    const wash = cssBlock(css, '.homepage-hero-light__wash');
    expect(wash).toContain('var(--hero-light-ion)');
    expect(wash).not.toContain('var(--hero-light-ultra)');
    expect(wash).not.toContain('var(--hero-light-pulse)');
    const edge = cssBlock(css, '.homepage-hero-light__edge');
    expect(edge).toContain('var(--hero-light-ultra)');
    expect(edge).toContain('var(--hero-light-pulse)');
    expect(edge).toContain('var(--hero-light-ion)');
    expect(edge).toContain(
      `--hero-light-roll-period: ${HERO_LIGHT_PERF.rollPeriodMs / 1000}s`
    );
    // Static by default: the roll runs only under an enabled budget.
    expect(edge).not.toMatch(/\banimation\s*:/);
    expect(css).toMatch(
      /prefers-reduced-motion:\s*no-preference\)\s*\{\s*\.homepage-hero-light\[data-animate="true"\] \.homepage-hero-light__edge\s*\{\s*animation: homepage-hero-light-roll var\(--hero-light-roll-period\)/
    );
    expect(css).toMatch(
      /prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none/
    );
  });

  it('stacks the hero copy on the shared spine and sets the proof beside the lead', () => {
    const css = readFileSync(join(DIR, 'HomepageHeroCanvas.css'), 'utf8');
    const copy = cssBlock(css, '.homepage-hero-canvas__copy');
    expect(copy).toContain('flex-direction: column');
    // The copy column is the shared ap-section-container spine, so its
    // children align to the spine's left edge, not the field center.
    expect(copy).toContain('align-items: flex-start');
    expect(copy).toContain('margin-inline: auto');
    // The proof keeps the crop's real aspect (780x1264 capture) and never exceeds the
    // capture's native width (390 CSS px = 24.375rem), so it stays crisp.
    // The lead fills the copy column instead of sizing to max-content, so
    // the subhead and claim button never run past a phone viewport (the
    // 390px CI capture clipped "Claim", 2026-10-29).
    const lead = cssBlock(css, '.homepage-hero-canvas__lead');
    expect(lead).toContain('align-self: stretch');
    expect(lead).toContain('width: 100%');
    expect(lead).toContain('min-width: 0');
    // The proof's crop geometry (aspect ratio, native-width cap) is a layout
    // spec, not a budget: HomepageHeroCanvas.test.tsx owns it.
    const gridSelector = '.homepage-hero-canvas__copy[data-has-proof="true"] {';
    const wideStart = css.lastIndexOf(
      '@media (min-width: 64rem)',
      css.indexOf(gridSelector)
    );
    const wide = balancedBlock(
      css.slice(wideStart),
      '@media (min-width: 64rem)'
    );
    const grid = cssBlock(
      wide,
      '.homepage-hero-canvas__copy[data-has-proof="true"]'
    );
    // Balanced two-column field at desktop: lead left, shot right.
    expect(grid).toContain('display: grid');
    expect(grid).toContain(
      'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)'
    );
    expect(grid).toContain('align-items: center');
    // Width follows the viewport height so the whole crop fits the first
    // viewport, capped at the native capture width.
    expect(wide).toMatch(
      /\.homepage-hero-canvas__proof \{[^}]*width: min\(\s*24rem,\s*calc\(\(100svh - var\(--hero-canvas-bar\) - var\(--space-32, 8rem\)\) \* 0\.617\)\s*\)/
    );
  });

  it('keeps the shot in the field flow under the claim on phone widths', () => {
    const css = readFileSync(join(DIR, 'HomepageHeroCanvas.css'), 'utf8');
    const narrow = balancedBlock(css, '@media (max-width: 63.99rem)');

    const field = balancedBlock(narrow, '.homepage-hero-canvas__field');
    expect(field).toContain('display: flex');
    expect(field).toContain('flex-direction: column');

    const copy = balancedBlock(narrow, '.homepage-hero-canvas__copy');
    expect(copy).toContain('flex: 1 0 auto');
    expect(copy).toContain('min-height: 0');
    // Founder-directed 2026-10-28 (claim-field focus fix): the copy no longer
    // clips. Text wraps via the width rules, and a clipping box cut the
    // CompositeField focus ring that draws outside the pill edge.
    expect(copy).toContain('overflow: visible');
    // The phone is in flow, so the copy never reserves fixed space for it.
    expect(copy).not.toMatch(/padding-bottom:\s*[\d.]+rem/);

    // In flow under the claim, never layered over the headline.
    const proof = balancedBlock(narrow, '.homepage-hero-canvas__proof');
    expect(proof).not.toContain('position: absolute');
    expect(proof).toContain('align-self: center');
    const base = cssBlock(css, '.homepage-hero-canvas__proof');
    expect(base).not.toContain('position: absolute');
    expect(base).toContain('width: min(80vw, 20rem)');
  });

  it('records the scoped WebGL exception without rewriting the standing rule', () => {
    const repo = join(DIR, '../../../../..');
    const canon = readFileSync(join(repo, 'canon/invariants.jsonl'), 'utf8');
    const perf = readFileSync(
      join(repo, 'docs/performance/performance-invariants-v1.md'),
      'utf8'
    );
    const harmony = readFileSync(
      join(repo, 'docs/design/night-dj-harmony-v1.md'),
      'utf8'
    );
    expect(canon).not.toContain('SHOW_HOMEPAGE_HERO_LIGHT');
    const flags = readFileSync(
      join(repo, 'apps/web/lib/flags/marketing-static.ts'),
      'utf8'
    );
    expect(flags).not.toContain('SHOW_HOMEPAGE_HERO_LIGHT');
    expect(perf).toContain('Rules binding repo edits');
    expect(perf).toContain(
      'This contract file intentionally changes no product or CI behavior.'
    );
    expect(perf).toContain(HERO_LIGHT_WEBGL_RULE);
    expect(harmony.startsWith('# night-dj-harmony-v1')).toBe(true);
    expect(heroLightWebGLExceptionViolations(perf)).toEqual([]);
    expect(heroLightWebGLExceptionViolations(harmony)).toEqual([]);
    const withoutRule = harmony.replace(HERO_LIGHT_WEBGL_RULE, '');
    expect(heroLightWebGLExceptionViolations(withoutRule)).toContain(
      'standing rule removed outside the exception record'
    );
  });
});
