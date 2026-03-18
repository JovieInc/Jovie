/**
 * DSP Registry Tests
 *
 * Validates the canonical DSP registry, derived exports, and drift prevention.
 */

import { describe, expect, it } from 'vitest';

import {
  buildSearchUrl,
  DSP_CONFIGS,
  DSP_REGISTRY,
  getRegistryEntry,
  getRegistryEntryByService,
  isDspPlatform,
  MUSICFETCH_ALL_SERVICES,
  MUSICFETCH_LINK_MAPPINGS,
  normalizePlatformKey,
  PLATFORM_TO_DSP_MAPPINGS,
  PROVIDER_DOMAINS,
  SERVICE_TO_PROVIDER,
  STREAMING_DSP_KEYS,
} from '@/lib/dsp-registry';

// ============================================================================
// Registry completeness
// ============================================================================

describe('DSP Registry completeness', () => {
  it('contains 40 entries (all MusicFetch services)', () => {
    expect(DSP_REGISTRY.length).toBe(40);
  });

  it('every entry has required fields', () => {
    for (const entry of DSP_REGISTRY) {
      expect(entry.key).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.musicfetchService).toBeTruthy();
      expect(entry.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(entry.textColor).toBeTruthy();
      expect(entry.logoSvg).toContain('<svg');
      expect(entry.category).toMatch(/^(streaming|video|metadata|social)$/);
      expect(typeof entry.showOnListenPage).toBe('boolean');
      expect(Array.isArray(entry.aliases)).toBe(true);
    }
  });

  it('has no duplicate keys', () => {
    const keys = DSP_REGISTRY.map(e => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no duplicate musicfetchService names', () => {
    const services = DSP_REGISTRY.map(e => e.musicfetchService);
    expect(new Set(services).size).toBe(services.length);
  });

  it('all keys are snake_case', () => {
    for (const entry of DSP_REGISTRY) {
      expect(entry.key).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
    }
  });
});

// ============================================================================
// Derived lists
// ============================================================================

describe('Derived exports', () => {
  it('STREAMING_DSP_KEYS matches entries with showOnListenPage', () => {
    const expected = DSP_REGISTRY.filter(e => e.showOnListenPage).map(
      e => e.key
    );
    expect(STREAMING_DSP_KEYS).toEqual(expected);
  });

  it('MUSICFETCH_ALL_SERVICES has one entry per registry entry', () => {
    expect(MUSICFETCH_ALL_SERVICES.length).toBe(DSP_REGISTRY.length);
  });

  it('SERVICE_TO_PROVIDER maps all musicfetchService values to valid keys', () => {
    for (const entry of DSP_REGISTRY) {
      expect(SERVICE_TO_PROVIDER[entry.musicfetchService]).toBe(entry.key);
    }
  });

  it('DSP_CONFIGS has entries for all showOnListenPage DSPs', () => {
    const listenPageKeys = DSP_REGISTRY.filter(e => e.showOnListenPage).map(
      e => e.key
    );
    for (const key of listenPageKeys) {
      expect(DSP_CONFIGS[key]).toBeDefined();
      expect(DSP_CONFIGS[key].name).toBeTruthy();
    }
  });

  it('PROVIDER_DOMAINS only includes entries with domains', () => {
    for (const [key, domains] of Object.entries(PROVIDER_DOMAINS)) {
      expect(domains.length).toBeGreaterThan(0);
      const entry = getRegistryEntry(key);
      expect(entry).toBeDefined();
      expect(entry!.domains.length).toBeGreaterThan(0);
    }
  });

  it('MUSICFETCH_LINK_MAPPINGS includes only streaming DSPs', () => {
    for (const mapping of MUSICFETCH_LINK_MAPPINGS) {
      const entry = getRegistryEntryByService(mapping.serviceKey);
      expect(entry).toBeDefined();
      expect(entry!.category).toBe('streaming');
    }
  });

  it('PLATFORM_TO_DSP_MAPPINGS includes only listen-page DSPs', () => {
    for (const mapping of PLATFORM_TO_DSP_MAPPINGS) {
      const entry = getRegistryEntry(mapping.dspKey);
      expect(entry).toBeDefined();
      expect(entry!.showOnListenPage).toBe(true);
    }
  });
});

// ============================================================================
// normalizePlatformKey
// ============================================================================

describe('normalizePlatformKey', () => {
  it('resolves snake_case keys', () => {
    expect(normalizePlatformKey('apple_music')).toBe('apple_music');
    expect(normalizePlatformKey('youtube_music')).toBe('youtube_music');
    expect(normalizePlatformKey('amazon_music')).toBe('amazon_music');
  });

  it('resolves kebab-case keys', () => {
    expect(normalizePlatformKey('apple-music')).toBe('apple_music');
    expect(normalizePlatformKey('youtube-music')).toBe('youtube_music');
    expect(normalizePlatformKey('amazon-music')).toBe('amazon_music');
  });

  it('resolves camelCase aliases', () => {
    expect(normalizePlatformKey('applemusic')).toBe('apple_music');
    expect(normalizePlatformKey('youtubemusic')).toBe('youtube_music');
    expect(normalizePlatformKey('amazonmusic')).toBe('amazon_music');
  });

  it('resolves aliases', () => {
    expect(normalizePlatformKey('itunes')).toBe('apple_music');
    expect(normalizePlatformKey('saavn')).toBe('jio_saavn');
    expect(normalizePlatformKey('jiosaavn')).toBe('jio_saavn');
  });

  it('is case-insensitive', () => {
    expect(normalizePlatformKey('SPOTIFY')).toBe('spotify');
    expect(normalizePlatformKey('AppleMusic')).toBe('apple_music');
  });

  it('returns null for unknown platforms', () => {
    expect(normalizePlatformKey('fakePlatform')).toBeNull();
    expect(normalizePlatformKey('')).toBeNull();
  });
});

// ============================================================================
// isDspPlatform
// ============================================================================

describe('isDspPlatform', () => {
  it('returns true for streaming DSPs', () => {
    expect(isDspPlatform('spotify')).toBe(true);
    expect(isDspPlatform('apple_music')).toBe(true);
    expect(isDspPlatform('deezer')).toBe(true);
    expect(isDspPlatform('jio_saavn')).toBe(true);
    expect(isDspPlatform('qq_music')).toBe(true);
  });

  it('handles kebab-case input', () => {
    expect(isDspPlatform('apple-music')).toBe(true);
    expect(isDspPlatform('amazon-music')).toBe(true);
  });

  it('returns false for YouTube (social for dashboard routing)', () => {
    expect(isDspPlatform('youtube')).toBe(false);
  });

  it('returns false for TikTok (social for dashboard routing)', () => {
    expect(isDspPlatform('tiktok')).toBe(false);
  });

  it('returns false for metadata services', () => {
    expect(isDspPlatform('genius')).toBe(false);
    expect(isDspPlatform('discogs')).toBe(false);
    expect(isDspPlatform('musicbrainz')).toBe(false);
  });

  it('returns false for unknown platforms', () => {
    expect(isDspPlatform('fakePlatform')).toBe(false);
    expect(isDspPlatform('')).toBe(false);
  });
});

// ============================================================================
// buildSearchUrl
// ============================================================================

describe('buildSearchUrl', () => {
  it('returns valid URLs for DSPs with templates', () => {
    const dspWithTemplates = DSP_REGISTRY.filter(
      e => e.searchUrlTemplate !== null
    );

    for (const entry of dspWithTemplates) {
      const url = buildSearchUrl(entry.key, 'test query');
      expect(url).toContain('test%20query');
      expect(url).toMatch(/^https?:\/\//);
    }
  });

  it('substitutes storefront for apple_music', () => {
    const url = buildSearchUrl('apple_music', 'query', { storefront: 'gb' });
    expect(url).toContain('/gb/');
  });

  it('returns null for DSPs without templates', () => {
    const url = buildSearchUrl('flo', 'test query');
    expect(url).toBeNull();
  });

  it('returns null for unknown keys', () => {
    const url = buildSearchUrl('unknown_dsp', 'test');
    expect(url).toBeNull();
  });
});

// ============================================================================
// Drift prevention
// ============================================================================

describe('Drift prevention', () => {
  it('MUSICFETCH_ALL_SERVICES length equals registry length', () => {
    expect(MUSICFETCH_ALL_SERVICES.length).toBe(DSP_REGISTRY.length);
  });

  it('every streaming DSP has a config', () => {
    for (const key of STREAMING_DSP_KEYS) {
      expect(DSP_CONFIGS[key]).toBeDefined();
    }
  });

  it('streaming DSP count is reasonable (29-35 range)', () => {
    // Guard against accidental bulk deletion or addition
    expect(STREAMING_DSP_KEYS.length).toBeGreaterThanOrEqual(29);
    expect(STREAMING_DSP_KEYS.length).toBeLessThanOrEqual(35);
  });

  it('registry categories are distributed correctly', () => {
    const counts = { streaming: 0, video: 0, metadata: 0, social: 0 };
    for (const entry of DSP_REGISTRY) {
      counts[entry.category]++;
    }
    expect(counts.streaming).toBeGreaterThanOrEqual(28);
    expect(counts.video).toBe(3);
    expect(counts.metadata).toBeGreaterThanOrEqual(6);
  });
});
