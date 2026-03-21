import { describe, expect, it } from 'vitest';
import {
  detectTrackingPixels,
  getCreatorOwnedPixels,
  mergeDiscoveredPixels,
} from '@/lib/ingestion/strategies/linktree/tracking-pixels';

describe('detectTrackingPixels', () => {
  it('returns null when HTML contains no pixels', () => {
    const html = '<html><body><h1>Hello World</h1></body></html>';
    expect(detectTrackingPixels(html)).toBeNull();
  });

  it('detects Facebook pixel from fbq init call', () => {
    const html = `
      <script>
        fbq('init', '123456789');
        fbq('track', 'PageView');
      </script>
    `;
    const result = detectTrackingPixels(html);
    expect(result).toEqual({
      facebook: { detected: true, pixelIds: ['123456789'] },
    });
  });

  it('detects TikTok and Google pixels together', () => {
    const html = `
      <script>
        ttq.load('C1234ABC');
        gtag('config', 'G-ABC12345');
      </script>
    `;
    const result = detectTrackingPixels(html);
    expect(result).toEqual({
      tiktok: { detected: true, pixelIds: ['C1234ABC'] },
      google: { detected: true, pixelIds: ['G-ABC12345'] },
    });
  });

  it('returns null when only script src is present without init call', () => {
    const html = `
      <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
      <script src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX"></script>
    `;
    expect(detectTrackingPixels(html)).toBeNull();
  });

  it('captures multiple Facebook pixel IDs', () => {
    const html = `
      <script>
        fbq('init', '111111111');
        fbq('init', '222222222');
      </script>
    `;
    const result = detectTrackingPixels(html);
    expect(result).toEqual({
      facebook: { detected: true, pixelIds: ['111111111', '222222222'] },
    });
  });

  it('handles whitespace and quote variations in init calls', () => {
    const html = `
      <script>
        fbq( 'init' , '123' );
      </script>
    `;
    const result = detectTrackingPixels(html);
    expect(result).toEqual({
      facebook: { detected: true, pixelIds: ['123'] },
    });
  });
});

describe('mergeDiscoveredPixels', () => {
  it('merges new Facebook with existing TikTok', () => {
    const existing = {
      tiktok: { detected: true as const, pixelIds: ['C999'] },
    };
    const incoming = {
      facebook: { detected: true as const, pixelIds: ['111'] },
    };
    const result = mergeDiscoveredPixels(existing, incoming);
    expect(result).toEqual({
      tiktok: { detected: true, pixelIds: ['C999'] },
      facebook: { detected: true, pixelIds: ['111'] },
    });
  });

  it('returns existing when incoming is null', () => {
    const existing = {
      facebook: { detected: true as const, pixelIds: ['111'] },
    };
    const result = mergeDiscoveredPixels(existing, null);
    expect(result).toBe(existing);
  });

  it('overwrites platform data when incoming has the same platform', () => {
    const existing = {
      facebook: { detected: true as const, pixelIds: ['OLD'] },
      tiktok: { detected: true as const, pixelIds: ['C999'] },
    };
    const incoming = {
      facebook: { detected: true as const, pixelIds: ['NEW'] },
    };
    const result = mergeDiscoveredPixels(existing, incoming);
    expect(result).toEqual({
      facebook: { detected: true, pixelIds: ['NEW'] },
      tiktok: { detected: true, pixelIds: ['C999'] },
    });
  });
});

describe('getCreatorOwnedPixels', () => {
  it('filters out suppressed pixel IDs', () => {
    const discovered = {
      facebook: { detected: true as const, pixelIds: ['111', '222'] },
    };
    const suppressed = new Set(['111']);
    const result = getCreatorOwnedPixels(discovered, suppressed);
    expect(result).toEqual({
      facebook: { detected: true, pixelIds: ['222'] },
    });
  });

  it('returns null when all pixel IDs are suppressed', () => {
    const discovered = {
      facebook: { detected: true as const, pixelIds: ['111'] },
      tiktok: { detected: true as const, pixelIds: ['C999'] },
    };
    const suppressed = new Set(['111', 'C999']);
    const result = getCreatorOwnedPixels(discovered, suppressed);
    expect(result).toBeNull();
  });

  it('keeps unsuppressed IDs and removes suppressed ones', () => {
    const discovered = {
      facebook: { detected: true as const, pixelIds: ['111', '222'] },
      google: { detected: true as const, pixelIds: ['G-KEEP'] },
    };
    const suppressed = new Set(['111']);
    const result = getCreatorOwnedPixels(discovered, suppressed);
    expect(result).toEqual({
      facebook: { detected: true, pixelIds: ['222'] },
      google: { detected: true, pixelIds: ['G-KEEP'] },
    });
  });
});
