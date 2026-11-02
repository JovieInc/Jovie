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

function fixture({ source = 'export const Step = 1;\n', bytes = 10 } = {}) {
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
