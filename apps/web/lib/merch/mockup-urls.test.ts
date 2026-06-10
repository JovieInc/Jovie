import { describe, expect, it } from 'vitest';
import {
  hasRenderableMockup,
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
  });

  it('prefers Printful mockups over internal placeholders', () => {
    expect(
      selectPreferredMockupUrl([
        'https://blob.vercel-storage.com/merch/generated/a/b/c-mockup.jpg',
        'https://files.printful.com/mockup/tee.jpg',
      ])
    ).toBe('https://files.printful.com/mockup/tee.jpg');
  });

  it('falls back to the first URL when no Printful mockup exists', () => {
    expect(
      selectPreferredMockupUrl([
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
