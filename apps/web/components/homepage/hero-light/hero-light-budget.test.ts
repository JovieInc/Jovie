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
