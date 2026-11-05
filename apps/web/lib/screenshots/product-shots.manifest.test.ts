import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  expandVariants,
  isShotStale,
  PRODUCT_SHOT_MAX_BYTES,
  type ShotManifestEntry,
} from '../../scripts/product-shots/plan';
import { PRODUCT_SHOTS } from './product-shots';

const repoRoot = resolve(process.cwd(), '../..');
const manifest = JSON.parse(
  readFileSync(
    join(repoRoot, 'apps/web/lib/screenshots/product-shots.manifest.json'),
    'utf8'
  )
) as { shots: Record<string, ShotManifestEntry> };

describe('committed product-shot provenance', () => {
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
