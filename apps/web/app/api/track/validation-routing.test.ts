import { describe, expect, it } from 'vitest';
import { validateTrackRequest } from './validation';

const base = { handle: 'tim', linkType: 'listen', target: 'apple_music' };

describe('track routing telemetry context', () => {
  it('keeps only opaque, bounded, country-level routing fields', () => {
    const result = validateTrackRequest({
      ...base,
      context: {
        clickId: 'c0ffee00-1111-2222-3333-444455556666',
        ttdMs: 999_999,
        storefront: 'JP',
        visitorCountry: 'jp',
        ip: '203.0.113.9',
        city: 'Tokyo',
        userAgent: 'x',
      },
    });
    expect('data' in result && result.data.context).toEqual({
      clickId: 'c0ffee00-1111-2222-3333-444455556666',
      ttdMs: 120_000,
      storefront: 'jp',
      visitorCountry: 'jp',
    });
  });

  it('drops malformed ids and countries', () => {
    const result = validateTrackRequest({
      ...base,
      context: { clickId: 'x y', storefront: 'USA', visitorCountry: '1' },
    });
    expect('data' in result && result.data.context).toBeUndefined();
  });
});
