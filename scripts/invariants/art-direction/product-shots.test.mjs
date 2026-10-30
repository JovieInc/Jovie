import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { hashShotSources } from '../../../apps/web/scripts/product-shots/source-hash.mjs';
import { SOURCE_GUARDS } from '../../ci-fast-lanes.mjs';
import { REPO_ROOT } from './paths.mjs';
import {
  checkFreshness,
  checkGeometry,
  rawImageryIds,
  SHOT_MANIFEST,
  SHOT_MAX_BYTES,
  SHOT_PUBLIC_DIR,
} from './product-shots.mjs';

const SOURCE = 'apps/web/components/features/onboarding/Step.tsx';

function write(root, rel, content) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function fixture({
  source = 'export const Step = 1;\n',
  bytes = 10,
  shot = {},
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'product-shots-'));
  write(root, SOURCE, 'export const Step = 1;\n');
  const sourceHash = hashShotSources(root, [SOURCE]);
  write(root, SOURCE, source);
  write(
    root,
    SHOT_MANIFEST,
    JSON.stringify({
      schema: 'jovie.product-shots/v1',
      shots: {
        'setup-step': {
          width: 10,
          height: 10,
          sourceHash,
          specHash: 'x',
          renderedAt: '2026-10-29T00:00:00.000Z',
          sources: [SOURCE],
          bytes: { avif: bytes, webp: bytes },
          frame: 'bare',
          fullScreen: false,
          displayWidth: 400,
          capture: {
            cssWidth: 440,
            cssHeight: 220,
            viewportWidth: 1440,
            viewportHeight: 900,
          },
          minTextPx: 14,
          ...shot,
        },
      },
    })
  );
  for (const format of ['avif', 'webp']) {
    write(root, `${SHOT_PUBLIC_DIR}/setup-step.${format}`, 'x'.repeat(bytes));
  }
  return root;
}

describe('product-shot freshness', () => {
  it('passes when the source matches the rendered hash', () => {
    assert.deepEqual(checkFreshness(fixture()), []);
  });

  it('fails a shot whose source component changed after the render', () => {
    const [failure] = checkFreshness(
      fixture({ source: 'export const Step = 2;\n' })
    );
    assert.match(failure, /setup-step: stale/);
    assert.match(failure, /shots:render --stale/);
  });

  it('fails a shot over the byte ceiling', () => {
    const failures = checkFreshness(fixture({ bytes: SHOT_MAX_BYTES + 1 }));
    assert.equal(failures.length, 2);
    assert.match(failures[0], /tighten the crop/);
  });

  it('treats CRLF and LF checkouts as the same source', () => {
    const root = fixture({ source: 'export const Step = 1;\r\n' });
    assert.deepEqual(checkFreshness(root), []);
  });
});

describe('product-shot geometry and readability (deliberate red)', () => {
  it('passes a tight crop with readable text', () => {
    assert.deepEqual(checkGeometry(fixture()), []);
  });

  it('fails a phone shot whose aspect is not the screen aspect', () => {
    const root = fixture({
      shot: {
        frame: 'phone',
        fullScreen: true,
        width: 700,
        height: 700,
        displayWidth: 320,
        capture: {
          cssWidth: 320,
          cssHeight: 320,
          viewportWidth: 390,
          viewportHeight: 844,
        },
      },
    });
    assert.match(checkGeometry(root).join('\n'), /screen aspect/);
  });

  it('fails text that is 8px effective on the page', () => {
    const root = fixture({ shot: { minTextPx: 14 * (8 / 14) * (440 / 400) } });
    assert.match(checkGeometry(root).join('\n'), /minimum 11px/);
  });

  it('fails a crop of the whole viewport that is not declared fullScreen', () => {
    const root = fixture({
      shot: {
        displayWidth: 1300,
        capture: {
          cssWidth: 1300,
          cssHeight: 800,
          viewportWidth: 1440,
          viewportHeight: 900,
        },
      },
    });
    assert.match(checkGeometry(root).join('\n'), /crop covers/);
  });
});

describe('raw product imagery in marketing source', () => {
  it('flags catalog imports and public screenshot paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'product-shots-raw-'));
    write(
      root,
      'apps/web/components/marketing/Bad.tsx',
      [
        "import SHOT from '@/screenshot-catalog/current/onboarding-dsp-desktop.png';",
        "const src = '/product-screenshots/profile-desktop.png';",
      ].join('\n')
    );
    write(
      root,
      'apps/web/components/marketing/ProductShot.tsx',
      "const base = '/product-shots/x';"
    );
    assert.deepEqual(rawImageryIds(root), [
      'apps/web/components/marketing/Bad.tsx#product-screenshots-path',
      'apps/web/components/marketing/Bad.tsx#screenshot-catalog-import',
    ]);
  });
});

describe('CI wiring', () => {
  it('runs the art-direction lane when any shot source changes', () => {
    const lane = SOURCE_GUARDS.find(guard => guard.id === 'art-direction');
    assert.ok(lane, 'art-direction lane exists');
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, SHOT_MANIFEST), 'utf8')
    );
    for (const [id, entry] of Object.entries(manifest.shots)) {
      for (const source of entry.sources) {
        assert.ok(
          lane.inputs.test(source),
          `${id} source ${source} does not trigger the art-direction lane; add it to its inputs in scripts/ci-fast-lanes.mjs`
        );
      }
    }
  });
});
