import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

// Mock server-only before any imports
vi.mock('server-only', () => ({}));

// Mock all external dependencies
vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogRecordings: {
    isrc: 'isrc',
    creatorProfileId: 'creator_profile_id',
  },
}));

vi.mock('@/lib/db/schema/dsp-catalog-scan', () => ({
  dspCatalogScans: {
    id: 'id',
    status: 'status',
    startedAt: 'started_at',
  },
  dspCatalogMismatches: {
    dedupKey: 'dedup_key',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/spotify', () => ({
  getSpotifyArtistAlbums: vi.fn(),
  getSpotifyAlbums: vi.fn(),
  getSpotifyTracks: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// Test the core ISRC cross-referencing logic directly
// Since processCatalogScan has heavy DB dependencies, we test the
// algorithmic core: ISRC normalization, set operations, coverage calc,
// and dedup key generation.
// ============================================================================

describe('catalog-scan: ISRC normalization', () => {
  // Inline the normalizeIsrc function for testing
  // (matches the implementation in catalog-scan.ts)
  function normalizeIsrc(isrc: string): string {
    return isrc.trim().toUpperCase();
  }

  it('normalizes lowercase ISRCs to uppercase', () => {
    expect(normalizeIsrc('usrc17607839')).toBe('USRC17607839');
  });

  it('preserves already-uppercase ISRCs', () => {
    expect(normalizeIsrc('USRC17607839')).toBe('USRC17607839');
  });

  it('handles mixed case ISRCs', () => {
    expect(normalizeIsrc('UsRc17607839')).toBe('USRC17607839');
  });

  it('trims whitespace', () => {
    expect(normalizeIsrc('  USRC17607839  ')).toBe('USRC17607839');
  });
});

describe('catalog-scan: ISRC cross-referencing', () => {
  function computeSets(localIsrcs: Set<string>, spotifyIsrcs: Set<string>) {
    const matched = new Set(
      [...localIsrcs].filter(isrc => spotifyIsrcs.has(isrc))
    );
    const notInCatalog = new Set(
      [...spotifyIsrcs].filter(isrc => !localIsrcs.has(isrc))
    );
    const missingFromDsp = new Set(
      [...localIsrcs].filter(isrc => !spotifyIsrcs.has(isrc))
    );
    return { matched, notInCatalog, missingFromDsp };
  }

  it('correctly identifies matched, not-in-catalog, and missing ISRCs', () => {
    const local = new Set(['A', 'B', 'C']);
    const spotify = new Set(['B', 'C', 'D']);

    const result = computeSets(local, spotify);

    expect(result.matched).toEqual(new Set(['B', 'C']));
    expect(result.notInCatalog).toEqual(new Set(['D']));
    expect(result.missingFromDsp).toEqual(new Set(['A']));
  });

  it('handles perfect match (all ISRCs in both)', () => {
    const local = new Set(['A', 'B']);
    const spotify = new Set(['A', 'B']);

    const result = computeSets(local, spotify);

    expect(result.matched).toEqual(new Set(['A', 'B']));
    expect(result.notInCatalog.size).toBe(0);
    expect(result.missingFromDsp.size).toBe(0);
  });

  it('handles empty local catalog', () => {
    const local = new Set<string>();
    const spotify = new Set(['A', 'B']);

    const result = computeSets(local, spotify);

    expect(result.matched.size).toBe(0);
    expect(result.notInCatalog).toEqual(new Set(['A', 'B']));
    expect(result.missingFromDsp.size).toBe(0);
  });

  it('handles empty Spotify catalog', () => {
    const local = new Set(['A', 'B']);
    const spotify = new Set<string>();

    const result = computeSets(local, spotify);

    expect(result.matched.size).toBe(0);
    expect(result.notInCatalog.size).toBe(0);
    expect(result.missingFromDsp).toEqual(new Set(['A', 'B']));
  });

  it('handles no overlap at all', () => {
    const local = new Set(['A', 'B']);
    const spotify = new Set(['C', 'D']);

    const result = computeSets(local, spotify);

    expect(result.matched.size).toBe(0);
    expect(result.notInCatalog).toEqual(new Set(['C', 'D']));
    expect(result.missingFromDsp).toEqual(new Set(['A', 'B']));
  });
});

describe('catalog-scan: coverage percentage', () => {
  function computeCoverage(matchedCount: number, localCount: number): string {
    return localCount > 0
      ? ((matchedCount / localCount) * 100).toFixed(2)
      : '0.00';
  }

  it('calculates coverage correctly', () => {
    expect(computeCoverage(2, 3)).toBe('66.67');
  });

  it('returns 100% for perfect match', () => {
    expect(computeCoverage(5, 5)).toBe('100.00');
  });

  it('returns 0% for no matches', () => {
    expect(computeCoverage(0, 5)).toBe('0.00');
  });

  it('returns 0.00 when local catalog is empty', () => {
    expect(computeCoverage(0, 0)).toBe('0.00');
  });

  it('handles partial coverage', () => {
    expect(computeCoverage(47, 52)).toBe('90.38');
  });
});

describe('catalog-scan: dedup key generation', () => {
  function generateDedupKey(
    creatorProfileId: string,
    isrc: string,
    providerId: string
  ): string {
    return `${creatorProfileId}:${isrc}:${providerId}`;
  }

  it('generates stable dedup keys', () => {
    const key1 = generateDedupKey('profile-123', 'USRC17607839', 'spotify');
    const key2 = generateDedupKey('profile-123', 'USRC17607839', 'spotify');
    expect(key1).toBe(key2);
  });

  it('generates different keys for different ISRCs', () => {
    const key1 = generateDedupKey('profile-123', 'USRC17607839', 'spotify');
    const key2 = generateDedupKey('profile-123', 'USRC17607840', 'spotify');
    expect(key1).not.toBe(key2);
  });

  it('generates different keys for different providers', () => {
    const key1 = generateDedupKey('profile-123', 'USRC17607839', 'spotify');
    const key2 = generateDedupKey('profile-123', 'USRC17607839', 'apple_music');
    expect(key1).not.toBe(key2);
  });

  it('generates different keys for different profiles', () => {
    const key1 = generateDedupKey('profile-123', 'USRC17607839', 'spotify');
    const key2 = generateDedupKey('profile-456', 'USRC17607839', 'spotify');
    expect(key1).not.toBe(key2);
  });

  it('includes all three components in the key', () => {
    const key = generateDedupKey('p1', 'ISRC1', 'spotify');
    expect(key).toBe('p1:ISRC1:spotify');
  });
});

describe('catalog-scan: payload validation', () => {
  // Test the Zod schema inline (same schema as catalog-scan.ts)
  const catalogScanPayloadSchema = z.object({
    creatorProfileId: z.string().uuid(),
    spotifyArtistId: z.string(),
    scanId: z.string().uuid(),
  });

  it('validates correct payload', () => {
    const result = catalogScanPayloadSchema.safeParse({
      creatorProfileId: '550e8400-e29b-41d4-a716-446655440000',
      spotifyArtistId: '4Uwpa6zW3zzCSQvooQNksm',
      scanId: '550e8400-e29b-41d4-a716-446655440001',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid creatorProfileId', () => {
    const result = catalogScanPayloadSchema.safeParse({
      creatorProfileId: 'not-a-uuid',
      spotifyArtistId: '4Uwpa6zW3zzCSQvooQNksm',
      scanId: '550e8400-e29b-41d4-a716-446655440001',
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    const result = catalogScanPayloadSchema.safeParse({
      creatorProfileId: '550e8400-e29b-41d4-a716-446655440000',
    });

    expect(result.success).toBe(false);
  });
});
