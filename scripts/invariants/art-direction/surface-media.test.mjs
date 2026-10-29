import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkSurface,
  effectViolations,
  HERO_SCOPE_PREFIX,
  loadEffects,
  registryProblems,
  scopeIdFor,
  scopeViolations,
  surfaceViolations,
} from './surface-media.mjs';

const HAS_TS = (() => {
  try {
    createRequire(import.meta.url)('typescript');
    return true;
  } catch {
    return false;
  }
})();
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '../../..');
const MOTION = 'apps/web/components/marketing/motion/';
const MATTE = `${MOTION}matte-field-gl.ts`;
const ZOOM = `${MOTION}hero-shell-zoom.ts`;
const read = file => readFileSync(join(REPO, file), 'utf8');
const entry = file => ({ file, source: read(file) });

describe('surface media', () => {
  it('records unscoped canvas, WebGL, and video', () => {
    const file = 'apps/web/components/marketing/Field.tsx';
    assert.deepEqual(surfaceViolations('<canvas />', file), [`canvas:${file}`]);
    assert.deepEqual(
      surfaceViolations("gl = canvas.getContext('webgl2')", file),
      [`webgl:${file}`]
    );
    assert.deepEqual(surfaceViolations('<video poster="still.jpg" />', file), [
      `video:${file}`,
    ]);
  });

  it('allows the homepage hero when the scope keeps a non-WebGL reduced-motion fallback', () => {
    const hero = `${HERO_SCOPE_PREFIX}HomepageHeroLight.tsx`;
    const gl = `${HERO_SCOPE_PREFIX}hero-light-gl.ts`;
    assert.deepEqual(surfaceViolations('<canvas />', hero), []);
    assert.deepEqual(
      scopeViolations([
        {
          file: hero,
          source: [
            "if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;",
            'const poster = "CSS poster";',
            "if (renderer !== 'webgl') return null;",
            'return mountCanvas ? <canvas /> : null;',
          ].join('\n'),
        },
        { file: gl, source: "canvas.getContext('webgl2')" },
      ]),
      []
    );
  });

  it('fails a hero scope that drops the fallback or reduced motion', () => {
    const gl = `${HERO_SCOPE_PREFIX}hero-light-gl.ts`;
    assert.deepEqual(
      scopeViolations([{ file: gl, source: "getContext('webgl2')" }]),
      [
        'scope:homepage-hero:missing-reduced-motion',
        'scope:homepage-hero:missing-non-webgl-fallback',
      ]
    );
  });

  it('does not assert a feature flag stays off', () => {
    const source = readFileSync(join(HERE, 'surface-media.mjs'), 'utf8');
    assert.equal(source.includes('NIGHT_DJ_HARMONY_V1_ENABLED'), false);
    assert.equal(source.includes('flag-default'), false);
    const result = checkSurface();
    assert.deepEqual(result.failures, []);
    assert.ok(
      result.ids.every(
        id =>
          !id.includes('hero-light') && !id.includes('MarketingAmbientField')
      )
    );
    assert.deepEqual(result.ids, [
      'video:apps/web/app/(marketing)/solutions/[audience]/sections.tsx',
      'video:apps/web/components/marketing/changelog/CustomerChangelogArchive.tsx',
    ]);
  });

  it('reads its scopes from the motion-effects registry (ASR-039)', () => {
    const registry = loadEffects();
    assert.deepEqual(registryProblems(registry), []);
    assert.deepEqual(
      registry.effects.map(effect => effect.id),
      ['homepage-hero', 'marketing-ambient-field', 'marketing-matte-motion']
    );
    assert.equal(scopeIdFor(MATTE), 'marketing-matte-motion');
    assert.equal(scopeIdFor(ZOOM), 'marketing-matte-motion');
    assert.equal(
      scopeIdFor(`${HERO_SCOPE_PREFIX}anything.css`),
      'homepage-hero'
    );
    assert.equal(scopeIdFor('apps/web/components/marketing/Other.tsx'), null);
  });

  it('passes every registered effect as shipped', () => {
    const files = loadEffects()
      .effects.flatMap(effect => effect.files)
      .filter(file => !file.endsWith('/'));
    assert.deepEqual(effectViolations(files.map(entry)), []);
  });

  it('fails an effect whose file drops prefers-reduced-motion (deliberate red)', () => {
    const stripped = {
      file: MATTE,
      source: read(MATTE).replaceAll('prefers-reduced-motion', 'always-on'),
    };
    assert.deepEqual(effectViolations([stripped, entry(ZOOM)]), [
      `scope:marketing-matte-motion:missing-reduced-motion-in:${MATTE}`,
    ]);
  });

  it('fails a GL file with no offscreen pause or no frame cap', () => {
    const gl = read(MATTE)
      .replace(/IntersectionObserver|visibilitychange/g, 'x')
      .replace(/fpsCap|FRAME_INTERVAL|1000\s*\/\s*\d+/g, 'y');
    const out = effectViolations([{ file: MATTE, source: gl }, entry(ZOOM)]);
    assert.ok(
      out.includes(
        `scope:marketing-matte-motion:missing-offscreen-pause:${MATTE}`
      )
    );
    assert.ok(
      out.includes(`scope:marketing-matte-motion:missing-fps-cap:${MATTE}`)
    );
  });

  it('fails an effect over its transpiled gzip budget', {
    skip: !HAS_TS,
  }, () => {
    const registry = structuredClone(loadEffects());
    const effect = registry.effects.find(
      e => e.id === 'marketing-matte-motion'
    );
    effect.budget.gzipBytes = 100;
    effect.budget.perFileGzipBytes[ZOOM] = 100;
    const out = effectViolations([entry(MATTE), entry(ZOOM)], registry);
    assert.ok(
      out.some(f =>
        f.startsWith(`scope:marketing-matte-motion:over-budget:${ZOOM}:`)
      )
    );
    assert.ok(
      out.some(f =>
        /^scope:marketing-matte-motion:over-budget:\d+>100$/.test(f)
      )
    );
  });

  it('rejects a malformed registry', () => {
    assert.deepEqual(registryProblems({ schema: 'nope' }), [
      'registry:schema must be jovie.motion-effects/v1',
    ]);
    const bad = {
      schema: 'jovie.motion-effects/v1',
      effects: [
        { id: 'x', files: [], fallback: '(', reducedMotion: {}, budget: {} },
      ],
    };
    const problems = registryProblems(bad);
    for (const p of [
      'files',
      'fallback-not-a-regex',
      'reduced-motion-marker',
      'budget-gzipBytes',
      'budget-pausesOffscreen',
      'budget-fpsCap',
    ]) {
      assert.ok(problems.includes(`registry:x:${p}`), p);
    }
  });
});
