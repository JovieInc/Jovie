import { describe, expect, it } from 'vitest';
import {
  hasFinishedGarmentMockup,
  hasRenderableMockup,
  isCompositedMerchMockupUrl,
  isInternalMerchMockupUrl,
  isPrintfulMockupUrl,
  selectPreferredMockupUrl,
} from './mockup-urls';

describe('mockup-urls', () => {
  it('detects Printful mockup hosts', () => {
    expect(
      isPrintfulMockupUrl('https://files.printful.com/mockup/tee.jpg')
    ).toBe(true);
    expect(isPrintfulMockupUrl('https://cdn.test/internal-mockup.jpg')).toBe(
      false
    );
  });

  it('detects internal composited mockup paths', () => {
    expect(
      isInternalMerchMockupUrl(
        'https://blob.vercel-storage.com/merch/generated/profile/gen/opt-mockup.jpg'
      )
    ).toBe(true);
    expect(
      isCompositedMerchMockupUrl(
        'https://blob.vercel-storage.com/merch/generated/profile/gen/opt-mockup.jpg'
      )
    ).toBe(true);
  });

  it('does not treat a print-art PNG as a finished garment mockup', () => {
    const printArt =
      'https://blob.vercel-storage.com/merch/generated/a/b/c-print.png';
    expect(isCompositedMerchMockupUrl(printArt)).toBe(false);
    expect(selectPreferredMockupUrl([printArt])).toBeNull();
    expect(hasFinishedGarmentMockup([printArt])).toBe(false);
  });

  it('prefers Printful mockups over internal placeholders', () => {
    expect(
      selectPreferredMockupUrl([
        'https://blob.vercel-storage.com/merch/generated/a/b/c-mockup.jpg',
        'https://files.printful.com/mockup/tee.jpg',
      ])
    ).toBe('https://files.printful.com/mockup/tee.jpg');
  });

  it('falls back to the composited garment when no Printful mockup exists', () => {
    expect(
      selectPreferredMockupUrl([
        'https://blob.vercel-storage.com/merch/generated/a/b/c-print.png',
        'https://blob.vercel-storage.com/merch/generated/a/b/c-mockup.jpg',
      ])
    ).toBe('https://blob.vercel-storage.com/merch/generated/a/b/c-mockup.jpg');
  });

  it('reports when a renderable mockup exists', () => {
    expect(hasRenderableMockup([])).toBe(false);
    expect(
      hasRenderableMockup([
        'https://blob.vercel-storage.com/merch/generated/a/b/c-mockup.jpg',
      ])
    ).toBe(true);
  });
});
