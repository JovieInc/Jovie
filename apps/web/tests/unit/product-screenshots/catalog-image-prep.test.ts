import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { captureOnlyWhenImagesReady } from '../../product-screenshots/image-prep-policy';

const catalogSource = readFileSync(
  join(process.cwd(), 'tests/product-screenshots/catalog.spec.ts'),
  'utf8'
);

describe('catalog screenshot image preparation', () => {
  it('prepares images and refuses to capture when preparation fails', async () => {
    const capture = vi.fn(async () => true);
    const incomplete = new Error(
      'Screenshot images are incomplete. Refusing to replace a complete capture.'
    );

    await expect(
      captureOnlyWhenImagesReady(async () => {
        throw incomplete;
      }, capture)
    ).rejects.toBe(incomplete);
    expect(capture).not.toHaveBeenCalled();

    await expect(
      captureOnlyWhenImagesReady(async () => undefined, capture)
    ).resolves.toBe(true);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('keeps catalog capture behind prepareImagesForScreenshot', () => {
    expect(catalogSource).toContain('prepareImagesForScreenshot');
    expect(catalogSource).toContain('captureOnlyWhenImagesReady');
    expect(catalogSource).not.toContain('waitForImages(');
    expect(catalogSource).not.toContain('.catch(() => {})');
    const guardedCapture = catalogSource.indexOf('captureOnlyWhenImagesReady');
    expect(
      catalogSource.indexOf('captureCatalogImage', guardedCapture)
    ).toBeGreaterThan(guardedCapture);
  });
});
