import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_SHOTS } from '../../lib/screenshots/product-shots';
import { hashShotSources, hashShotSpec } from './source-hash.mjs';

describe('product-shot source and pixel fingerprints', () => {
  it('normalizes line endings while detecting changed bytes and source order', () => {
    const root = mkdtempSync(join(tmpdir(), 'shot-hash-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/a.ts'), 'a\r\n');
    writeFileSync(join(root, 'src/b.ts'), 'b\n');
    const original = hashShotSources(root, ['src/a.ts', 'src/b.ts']);
    writeFileSync(join(root, 'src/a.ts'), 'a\n');
    expect(hashShotSources(root, ['src/a.ts', 'src/b.ts'])).toBe(original);
    expect(hashShotSources(root, ['src/b.ts', 'src/a.ts'])).not.toBe(original);
    writeFileSync(join(root, 'src/a.ts'), 'changed\n');
    expect(hashShotSources(root, ['src/a.ts', 'src/b.ts'])).not.toBe(original);
  });

  it('fails closed when a declared source is missing', () => {
    expect(() =>
      hashShotSources(mkdtempSync(join(tmpdir(), 'shot-missing-')), [
        'missing.ts',
      ])
    ).toThrow();
  });

  it('changes pixel fingerprints for crop or theme, preserving text-only metadata', () => {
    const shot = PRODUCT_SHOTS[0];
    const original = hashShotSpec(shot);
    expect(
      hashShotSpec({
        ...shot,
        alt: 'Accessible description',
        title: 'Registry metadata',
      })
    ).toBe(original);
    expect(hashShotSpec({ ...shot, theme: 'light' })).not.toBe(original);
    expect(hashShotSpec({ ...shot, padding: 11 })).not.toBe(original);
  });
});
