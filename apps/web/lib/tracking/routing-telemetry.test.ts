import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRoutingTelemetry, storefrontOfUrl } from './routing-telemetry';

const APPLE = 'https://music.apple.com/us/album/x/1';

describe('buildRoutingTelemetry', () => {
  afterEach(() => {
    document.cookie = 'jv_country=; max-age=0; path=/';
    vi.restoreAllMocks();
  });

  it('records chosen storefront vs visitor country with an opaque click id', () => {
    document.cookie = 'jv_country=JP; path=/';
    const { telemetry, url } = buildRoutingTelemetry({
      providerId: 'apple_music',
      url: APPLE,
    });
    expect(url).toContain('/jp/');
    expect(telemetry.storefront).toBe('jp');
    expect(telemetry.visitorCountry).toBe('jp');
    expect(telemetry.clickId).toMatch(/\S{8,}/);
    expect(Object.keys(telemetry).sort()).toEqual([
      'clickId',
      'storefront',
      'ttdMs',
      'visitorCountry',
    ]);
  });

  it('omits storefront for non-Apple providers and country when unknown', () => {
    const { telemetry } = buildRoutingTelemetry({
      providerId: 'spotify',
      url: 'https://open.spotify.com/album/a',
    });
    expect(telemetry.storefront).toBeUndefined();
    expect(telemetry.visitorCountry).toBeUndefined();
  });

  it('reads storefronts from Apple URLs only', () => {
    expect(storefrontOfUrl(APPLE)).toBe('us');
    expect(storefrontOfUrl('https://open.spotify.com/us/x')).toBeUndefined();
  });
});
