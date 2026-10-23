import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkSurface,
  HERO_SCOPE_PREFIX,
  scopeViolations,
  surfaceViolations,
} from './surface-media.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

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
});
