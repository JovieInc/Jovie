import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PRODUCT_SURFACE_COUNTS } from '../data/marketing/productSurfaceCounts';
import {
  collectProductSurfaceCounts,
  renderProductSurfaceCounts,
} from './generate-product-surface-counts';

const outputPath = resolve(
  import.meta.dirname,
  '../data/marketing/product-surface-counts.gen.json'
);

describe('product surface counts', () => {
  it('matches the generated file marketing pages import', () => {
    expect(readFileSync(outputPath, 'utf8')).toBe(renderProductSurfaceCounts());
    expect(PRODUCT_SURFACE_COUNTS).toEqual(collectProductSurfaceCounts());
  });

  it('keeps tracked-link categories aligned with the flat preset list', () => {
    const counts = collectProductSurfaceCounts();
    const summed = counts.trackedLinks.categories.reduce(
      (sum, category) => sum + category.presetCount,
      0
    );
    expect(summed).toBe(counts.trackedLinks.presetCount);
    expect(counts.keyboardShortcuts.gThenCount).toBe(
      counts.keyboardShortcuts.gThenSequences.length
    );
    expect(counts.keyboardShortcuts.publicCatalogCount).toBeGreaterThan(0);
    expect(counts.commands.defaultRegistry.total).toBeGreaterThan(0);
  });
});
