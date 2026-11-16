import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  expandVariants,
  isShotStale,
  PRODUCT_SHOT_MAX_BYTES,
  type ShotManifestEntry,
} from '../../scripts/product-shots/plan';
import {
  hashShotSources,
  hashShotSpec,
} from '../../scripts/product-shots/source-hash.mjs';
import { PRODUCT_SHOTS } from './product-shots';

const repoRoot = resolve(process.cwd(), '../..');
const manifest = JSON.parse(
  readFileSync(
    join(repoRoot, 'apps/web/lib/screenshots/product-shots.manifest.json'),
    'utf8'
  )
) as { shots: Record<string, ShotManifestEntry> };

describe('committed product-shot provenance', () => {
  it('invalidates the profile hero when its live fixture input changes', () => {
    const fixture =
      'apps/web/components/features/home/homepage-profile-preview-fixture.ts';
    const spec = PRODUCT_SHOTS.find(
      shot => shot.id === 'profile-hero-desktop'
    )!;
    expect(spec.sources).toContain(fixture);
    const root = mkdtempSync(join(tmpdir(), 'shot-fixture-freshness-'));
    for (const source of spec.sources) {
      mkdirSync(dirname(join(root, source)), { recursive: true });
      writeFileSync(join(root, source), readFileSync(join(repoRoot, source)));
    }
    const shots = {
      [spec.id]: {
        ...manifest.shots[spec.id],
        sourceHash: hashShotSources(root, spec.sources),
        specHash: hashShotSpec(spec),
      },
    };
    expect(isShotStale(root, spec, shots)).toBe(false);
    writeFileSync(
      join(root, fixture),
      readFileSync(join(root, fixture), 'utf8').replaceAll(
        "'Tim White'",
        "'Changed fixture artist'"
      )
    );
    expect(isShotStale(root, spec, shots)).toBe(true);
  });

  it.each([
    [
      'profile-hero-desktop',
      'apps/web/lib/tim-white.ts',
      "name: 'Tim White'",
      "name: 'Changed artist'",
    ],
    [
      'profile-hero-desktop',
      'apps/web/components/features/home/home-surface-seed.ts',
      "title: 'Take Me Over'",
      "title: 'Changed release'",
    ],
    [
      'setup-claim-handle',
      'apps/web/lib/tim-white.ts',
      "publicProfileHandle: 'tim'",
      "publicProfileHandle: 'changed-handle'",
    ],
  ] as const)(
    'invalidates %s when live data %s changes',
    (id, input, before, after) => {
      const spec = PRODUCT_SHOTS.find(shot => shot.id === id)!;
      expect(spec.sources).toContain(input);
      const root = mkdtempSync(join(tmpdir(), 'shot-live-data-'));
      for (const source of spec.sources) {
        mkdirSync(dirname(join(root, source)), { recursive: true });
        writeFileSync(join(root, source), readFileSync(join(repoRoot, source)));
      }
      const shots = {
        [id]: {
          ...manifest.shots[id],
          sourceHash: hashShotSources(root, spec.sources),
          specHash: hashShotSpec(spec),
        },
      };
      expect(isShotStale(root, spec, shots)).toBe(false);
      const original = readFileSync(join(root, input), 'utf8');
      expect(original).toContain(before);
      writeFileSync(join(root, input), original.replaceAll(before, after));
      expect(isShotStale(root, spec, shots)).toBe(true);
    }
  );

  it.each(PRODUCT_SHOTS)(
    'keeps $id fresh against this checkout and actual image files',
    spec => {
      expect(isShotStale(repoRoot, spec, manifest.shots)).toBe(false);
      for (const variant of expandVariants(spec)) {
        const entry = manifest.shots[variant.id];
        expect(entry.sources).toEqual([...variant.sources]);
        for (const format of ['avif', 'webp'] as const) {
          const bytes = statSync(
            join(
              repoRoot,
              'apps/web/public/product-shots',
              variant.id + '.' + format
            )
          ).size;
          expect(bytes).toBe(entry.bytes[format]);
          expect(bytes).toBeLessThanOrEqual(PRODUCT_SHOT_MAX_BYTES);
        }
      }
    }
  );
});
