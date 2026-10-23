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

  it('paints only the scene palette, with Ultra and Pulse on the edge', () => {
    const css = readFileSync(join(DIR, 'HomepageHeroLight.css'), 'utf8');
    for (const hex of Object.values(HERO_LIGHT_SCENE)) {
      expect(css).toContain(hex);
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
    expect(edge).toContain(
      'animation: homepage-hero-light-roll var(--hero-light-roll-period)'
    );
    expect(css).toMatch(
      /prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none/
    );
  });

  it('stacks the hero copy and keeps the proof phone inside the field', () => {
    const css = readFileSync(join(DIR, 'HomepageHeroCanvas.css'), 'utf8');
    const copy = cssBlock(css, '.homepage-hero-canvas__copy');
    expect(copy).toContain('flex-direction: column');
    expect(copy).toContain('align-items: center');
    const phone = cssBlock(
      css,
      '.homepage-hero-canvas__proof .homepage-artist-hero__phone'
    );
    expect(phone).toContain('width: 100%');
  });

  it('keeps the phone in the field flow under the copy on phone widths', () => {
    const css = readFileSync(join(DIR, 'HomepageHeroCanvas.css'), 'utf8');
    const narrow = balancedBlock(css, '@media (max-width: 63.99rem)');

    const field = balancedBlock(narrow, '.homepage-hero-canvas__field');
    expect(field).toContain('display: flex');
    expect(field).toContain('flex-direction: column');

    const copy = balancedBlock(narrow, '.homepage-hero-canvas__copy');
    expect(copy).toContain('flex: 1 1 auto');
    expect(copy).toContain('min-height: 0');
    expect(copy).toContain('overflow: hidden');
    // The phone is in flow, so the copy never reserves fixed space for it.
    expect(copy).not.toMatch(/padding-bottom:\s*[\d.]+rem/);

    const proof = balancedBlock(narrow, '.homepage-hero-canvas__proof');
    // In flow under the copy — never layered over the headline.
    expect(proof).toContain('position: relative');
    expect(proof).not.toContain('position: absolute');
    // Height-driven with the real screen aspect; the ceiling reserves the
    // bar plus a 20rem copy budget so the phone yields before the copy
    // clips, then the floor binds, then the copy clips inside itself
    // bottom-up.
    expect(proof).toContain(
      'height: min(30svh, 15.75rem, calc(100svh - var(--hero-canvas-bar) - 20rem))'
    );
    expect(proof).toContain('aspect-ratio: 402 / 874');
    expect(proof).toContain('flex: 0 1 auto');
    expect(proof).toContain('min-height: 7rem');
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
