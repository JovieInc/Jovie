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
    const verify = vi.fn(async () => undefined);
    const capture = vi.fn(async () => true);
    const incomplete = new Error(
      'Screenshot images are incomplete. Refusing to replace a complete capture.'
    );

    await expect(
      captureOnlyWhenImagesReady(
        async () => {
          throw incomplete;
        },
        verify,
        capture
      )
    ).rejects.toBe(incomplete);
    expect(capture).not.toHaveBeenCalled();

    await expect(
      captureOnlyWhenImagesReady(async () => undefined, verify, capture)
    ).resolves.toBe(true);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('refuses to capture when a lazy image is still incomplete at capture time', async () => {
    const prepare = vi.fn(async () => undefined);
    const verify = vi.fn(async () => {
      throw new Error(
        'Rejecting capture: 1 image(s) not fully loaded: /hero.png [loading=eager, complete=false, naturalWidth=0]'
      );
    });
    const capture = vi.fn(async () => true);

    await expect(
      captureOnlyWhenImagesReady(prepare, verify, capture)
    ).rejects.toThrow(/not fully loaded/);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(capture).not.toHaveBeenCalled();
  });

  it('rejects the candidate when an image goes incomplete after the capture', async () => {
    const prepare = vi.fn(async () => undefined);
    const verify = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(
        new Error(
          'Rejecting capture: 1 image(s) not fully loaded: /how-it-works.png [loading=eager, complete=false, naturalWidth=0]'
        )
      );
    const capture = vi.fn(async () => true);

    await expect(
      captureOnlyWhenImagesReady(prepare, verify, capture)
    ).rejects.toThrow(/not fully loaded/);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('verifies readiness before and after the capture, in order', async () => {
    const calls: string[] = [];
    const prepare = vi.fn(async () => {
      calls.push('prepare');
    });
    const verify = vi.fn(async () => {
      calls.push('verify');
    });
    const capture = vi.fn(async () => {
      calls.push('capture');
      return 'captured';
    });

    await expect(
      captureOnlyWhenImagesReady(prepare, verify, capture)
    ).resolves.toBe('captured');
    expect(calls).toEqual(['prepare', 'verify', 'capture', 'verify']);
  });

  it('keeps catalog capture behind prepareImagesForScreenshot', () => {
    expect(catalogSource).toContain('prepareImagesForScreenshot');
    expect(catalogSource).toContain('captureOnlyWhenImagesReady');
    expect(catalogSource).toContain('assertImagesReadyForCapture');
    expect(catalogSource).not.toContain('waitForImages(');
    expect(catalogSource).not.toContain('.catch(() => {})');
    const guardedCapture = catalogSource.indexOf('captureOnlyWhenImagesReady');
    expect(
      catalogSource.indexOf('captureCatalogImage', guardedCapture)
    ).toBeGreaterThan(guardedCapture);
  });
});
