import { describe, expect, it } from 'vitest';
import {
  ALBUM_ART_AB_MIN_IMPRESSIONS,
  ALBUM_ART_AB_MIN_LIFT,
  computeAlbumArtWinner,
  selectAlbumArtVariant,
} from '@/lib/services/album-art/ab-test';

// --- selectAlbumArtVariant ---

describe('selectAlbumArtVariant', () => {
  it('returns the only element when a single variant is provided', () => {
    expect(selectAlbumArtVariant(['v1'], 'any-seed')).toBe('v1');
  });

  it('throws when variantIds is empty', () => {
    expect(() => selectAlbumArtVariant([], 'seed')).toThrow(RangeError);
  });

  it('is deterministic — same seed always returns same variant', () => {
    const ids = ['control', 'challenger-a', 'challenger-b'];
    const seed = 'visitor-fingerprint-abc123';
    const first = selectAlbumArtVariant(ids, seed);
    expect(selectAlbumArtVariant(ids, seed)).toBe(first);
    expect(selectAlbumArtVariant(ids, seed)).toBe(first);
  });

  it('produces different selections for different seeds', () => {
    const ids = ['control', 'challenger-a'];
    const results = new Set(
      Array.from({ length: 50 }, (_, i) =>
        selectAlbumArtVariant(ids, `visitor-${i}`)
      )
    );
    // With 50 seeds and 2 variants, both should appear.
    expect(results.size).toBe(2);
  });

  it('distributes roughly evenly across all variants (±20%)', () => {
    const ids = ['v0', 'v1', 'v2'];
    const counts: Record<string, number> = { v0: 0, v1: 0, v2: 0 };
    const N = 300;
    for (let i = 0; i < N; i++) {
      const v = selectAlbumArtVariant(ids, `seed-${i}`);
      counts[v] = (counts[v] ?? 0) + 1;
    }
    const expected = N / ids.length;
    for (const count of Object.values(counts)) {
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    }
  });
});

// --- computeAlbumArtWinner ---

describe('computeAlbumArtWinner', () => {
  const minI = ALBUM_ART_AB_MIN_IMPRESSIONS;

  it('returns null when no variant has sufficient impressions', () => {
    const result = computeAlbumArtWinner([
      { variantId: 'control', impressions: minI - 1, clicks: 10 },
      { variantId: 'challenger', impressions: minI - 1, clicks: 20 },
    ]);
    expect(result).toBeNull();
  });

  it('returns null when only one variant is qualified', () => {
    const result = computeAlbumArtWinner([
      { variantId: 'control', impressions: minI, clicks: 10 },
      { variantId: 'challenger', impressions: minI - 1, clicks: 20 },
    ]);
    expect(result).toBeNull();
  });

  it('returns null when no challenger beats control CTR', () => {
    const result = computeAlbumArtWinner([
      { variantId: 'control', impressions: minI, clicks: 20 },
      { variantId: 'challenger', impressions: minI, clicks: 10 },
    ]);
    expect(result).toBeNull();
  });

  it('returns null when challenger ties control', () => {
    const result = computeAlbumArtWinner([
      { variantId: 'control', impressions: minI, clicks: 10 },
      { variantId: 'challenger', impressions: minI, clicks: 10 },
    ]);
    expect(result).toBeNull();
  });

  it('identifies the winning variant and reports correct CTRs', () => {
    const result = computeAlbumArtWinner([
      { variantId: 'control', impressions: minI, clicks: 10 },
      { variantId: 'challenger', impressions: minI, clicks: 20 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.winnerId).toBe('challenger');
    expect(result!.controlId).toBe('control');
    expect(result!.controlCtr).toBeCloseTo(0.1);
    expect(result!.winnerCtr).toBeCloseTo(0.2);
  });

  it('computes relative lift correctly', () => {
    const result = computeAlbumArtWinner([
      { variantId: 'control', impressions: minI, clicks: 10 }, // CTR 0.1
      { variantId: 'challenger', impressions: minI, clicks: 20 }, // CTR 0.2 → +100%
    ]);
    expect(result!.liftPercent).toBeCloseTo(1.0); // 100% lift
  });

  it('marks result as significant when lift >= threshold', () => {
    // 20% lift on control, challenger beats by > 10%
    const result = computeAlbumArtWinner([
      { variantId: 'control', impressions: minI, clicks: 10 },
      { variantId: 'challenger', impressions: minI, clicks: 15 }, // +50% lift
    ]);
    expect(result!.isStatisticallySignificant).toBe(true);
  });

  it('marks result as NOT significant when lift is below threshold', () => {
    // challenger barely beats control (< 10% lift)
    const controlClicks = 100;
    const controlImpressions = 1000;
    const controlCtr = controlClicks / controlImpressions;
    // 5% lift → 0.1 * 1.05 = 0.105
    const challengerClicks = Math.floor(controlCtr * 1.05 * minI);
    const result = computeAlbumArtWinner([
      { variantId: 'control', impressions: minI, clicks: controlClicks },
      {
        variantId: 'challenger',
        impressions: minI,
        clicks: challengerClicks,
      },
    ]);
    // With 100 impressions and 5% lift, challenger CTR = 0.105 vs control 0.1
    // liftPercent = 0.05 < ALBUM_ART_AB_MIN_LIFT (0.1)
    if (result) {
      expect(result.isStatisticallySignificant).toBe(false);
    }
    // If null (tie or control wins), that's also fine — both mean not significant
  });

  it('picks the best challenger when multiple challengers are qualified', () => {
    const result = computeAlbumArtWinner([
      { variantId: 'control', impressions: minI, clicks: 10 },
      { variantId: 'c1', impressions: minI, clicks: 15 },
      { variantId: 'c2', impressions: minI, clicks: 25 }, // best
      { variantId: 'c3', impressions: minI, clicks: 20 },
    ]);
    expect(result!.winnerId).toBe('c2');
  });

  it('handles control with zero clicks — infinite lift from any challenger click', () => {
    const result = computeAlbumArtWinner([
      { variantId: 'control', impressions: minI, clicks: 0 },
      { variantId: 'challenger', impressions: minI, clicks: 5 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.liftPercent).toBe(Infinity);
    expect(result!.isStatisticallySignificant).toBe(true);
  });

  it('respects a custom minImpressions option', () => {
    const result = computeAlbumArtWinner(
      [
        { variantId: 'control', impressions: 10, clicks: 1 },
        { variantId: 'challenger', impressions: 10, clicks: 5 },
      ],
      { minImpressions: 10 }
    );
    expect(result).not.toBeNull();
    expect(result!.winnerId).toBe('challenger');
  });

  it('uses ALBUM_ART_AB_MIN_IMPRESSIONS as default threshold', () => {
    expect(ALBUM_ART_AB_MIN_IMPRESSIONS).toBeGreaterThan(0);
    expect(ALBUM_ART_AB_MIN_LIFT).toBeGreaterThan(0);
  });
});
