import { describe, expect, it } from 'vitest';
import {
  getProductShot,
  getProductShotManifestEntry,
  getProductShotSpec,
  PRODUCT_SHOTS,
  type ProductShotId,
} from './product-shots';

describe('product-shot registry resolution', () => {
  it.each(PRODUCT_SHOTS)(
    'resolves $id with declared framing, text and versioned dimensions',
    spec => {
      const entry = getProductShotManifestEntry(spec.id)!;
      const shot = getProductShot(spec.id);
      expect(getProductShotSpec(spec.id)).toBe(spec);
      expect(shot).toMatchObject({
        id: spec.id,
        alt: spec.alt,
        frame: spec.frame,
        width: Math.round(entry.width / 2),
        height: Math.round(entry.height / 2),
      });
      expect(shot.avif).toBe(
        '/product-shots/' + spec.id + '.avif?v=' + entry.sourceHash.slice(0, 12)
      );
      expect(shot.webp).toBe(
        '/product-shots/' + spec.id + '.webp?v=' + entry.sourceHash.slice(0, 12)
      );
      expect(shot.mobile).toBeNull();
    }
  );

  it.each(['missing', 'toString', '__proto__'])(
    'rejects unregistered or inherited key %s',
    id => {
      expect(getProductShotSpec(id)).toBeNull();
      expect(getProductShotManifestEntry(id)).toBeNull();
      expect(() => getProductShot(id as ProductShotId)).toThrow(
        'Unknown product shot'
      );
    }
  );
});
