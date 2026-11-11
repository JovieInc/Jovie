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
const ZOOM = `${MOTION}hero-shell-zoom.ts`;
const read = file => readFileSync(join(REPO, file), 'utf8');
const entry = file => ({ file, source: read(file) });
// Synthetic GL effect: the shipped marketing roots have no always-on GL
// background left to use as a fixture (2026-10-29), so the deliberate-red
// cases run against an in-memory registry entry.
const FIXTURE = `${MOTION}fixture-field-gl.ts`;
const FIXTURE_SOURCE = [
  '// static fallback: the poster stays when this returns null',
  "if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;",
  "const gl = canvas.getContext('webgl2');",
  'const observer = new IntersectionObserver(() => {});',
  'const FRAME_INTERVAL = 1000 / 30;',
].join('\n');
const fixtureRegistry = () => {
  const registry = structuredClone(loadEffects());
  registry.effects.push({
    id: 'fixture-field',
    summary: 'Synthetic GL fixture.',
    files: [FIXTURE],
    fallback: 'static fallback',
    reducedMotion: { marker: 'prefers-reduced-motion', requiredIn: [FIXTURE] },
    budget: { gzipBytes: 2048, fpsCap: 30, pausesOffscreen: true },
  });
  return registry;
};

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
    assert.ok(result.ids.every(id => !id.includes('hero-light')));
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
      ['homepage-hero', 'marketing-hero-zoom']
    );
    assert.equal(scopeIdFor(ZOOM), 'marketing-hero-zoom');
    assert.equal(scopeIdFor(`${MOTION}matte-field-gl.ts`), null);
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
    const registry = fixtureRegistry();
    assert.deepEqual(
      effectViolations([{ file: FIXTURE, source: FIXTURE_SOURCE }], registry),
      []
    );
    const stripped = {
      file: FIXTURE,
      source: FIXTURE_SOURCE.replaceAll('prefers-reduced-motion', 'always-on'),
    };
    assert.deepEqual(effectViolations([stripped], registry), [
      `scope:fixture-field:missing-reduced-motion-in:${FIXTURE}`,
    ]);
  });

  it('fails a GL file with no offscreen pause or no frame cap', () => {
    const gl = FIXTURE_SOURCE.replace(
      /IntersectionObserver|visibilitychange/g,
      'x'
    ).replace(/fpsCap|FRAME_INTERVAL|1000\s*\/\s*\d+/g, 'y');
    const out = effectViolations(
      [{ file: FIXTURE, source: gl }],
      fixtureRegistry()
    );
    assert.ok(
      out.includes(`scope:fixture-field:missing-offscreen-pause:${FIXTURE}`)
    );
    assert.ok(out.includes(`scope:fixture-field:missing-fps-cap:${FIXTURE}`));
  });

  it('fails an effect over its transpiled gzip budget', {
    skip: !HAS_TS,
  }, () => {
    const registry = structuredClone(loadEffects());
    const effect = registry.effects.find(e => e.id === 'marketing-hero-zoom');
    effect.budget.gzipBytes = 100;
    effect.budget.perFileGzipBytes[ZOOM] = 100;
    const out = effectViolations([entry(ZOOM)], registry);
    assert.ok(
      out.some(f =>
        f.startsWith(`scope:marketing-hero-zoom:over-budget:${ZOOM}:`)
      )
    );
    assert.ok(
      out.some(f => /^scope:marketing-hero-zoom:over-budget:\d+>100$/.test(f))
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
