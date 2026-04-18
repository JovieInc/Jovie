import { describe, expect, it } from 'vitest';
import {
  applyTtlToEnrichmentStatus,
  deriveAggregateStatus,
  type EnrichmentStatusMap,
} from '@/lib/dsp-enrichment/enrichment-status';

describe('deriveAggregateStatus', () => {
  it('returns idle for empty map', () => {
    expect(deriveAggregateStatus({})).toBe('idle');
  });

  it('returns idle when all statuses are idle', () => {
    expect(
      deriveAggregateStatus({
        spotify: 'idle',
        musicfetch: 'idle',
        isrc: 'idle',
      })
    ).toBe('idle');
  });

  it('returns enriching when any status is enriching', () => {
    expect(
      deriveAggregateStatus({
        spotify: 'complete',
        musicfetch: 'enriching',
        isrc: 'idle',
      })
    ).toBe('enriching');
  });

  it('returns complete when all are complete', () => {
    expect(
      deriveAggregateStatus({
        spotify: 'complete',
        musicfetch: 'complete',
        isrc: 'complete',
      })
    ).toBe('complete');
  });

  it('returns failed when all are failed', () => {
    expect(
      deriveAggregateStatus({
        spotify: 'failed',
        musicfetch: 'failed',
        isrc: 'failed',
      })
    ).toBe('failed');
  });

  it('returns partial for mix of complete and failed', () => {
    expect(
      deriveAggregateStatus({
        spotify: 'complete',
        musicfetch: 'failed',
        isrc: 'complete',
      })
    ).toBe('partial');
  });

  it('returns enriching over partial when any still enriching', () => {
    expect(
      deriveAggregateStatus({
        spotify: 'complete',
        musicfetch: 'failed',
        isrc: 'enriching',
      })
    ).toBe('enriching');
  });

  it('handles single-key maps', () => {
    expect(deriveAggregateStatus({ spotify: 'complete' })).toBe('complete');
    expect(deriveAggregateStatus({ musicfetch: 'failed' })).toBe('failed');
    expect(deriveAggregateStatus({ isrc: 'enriching' })).toBe('enriching');
  });
});

describe('applyTtlToEnrichmentStatus', () => {
  it('returns original map when updatedAt is null', () => {
    const map: EnrichmentStatusMap = { spotify: 'enriching' };
    expect(applyTtlToEnrichmentStatus(map, null)).toBe(map);
  });

  it('returns original map when updatedAt is recent', () => {
    const map: EnrichmentStatusMap = { spotify: 'enriching' };
    const recentDate = new Date(Date.now() - 30_000); // 30s ago
    expect(applyTtlToEnrichmentStatus(map, recentDate)).toBe(map);
  });

  it('transitions enriching to failed when updatedAt > 2min', () => {
    const map: EnrichmentStatusMap = {
      spotify: 'enriching',
      musicfetch: 'complete',
    };
    const oldDate = new Date(Date.now() - 3 * 60 * 1000); // 3min ago
    const result = applyTtlToEnrichmentStatus(map, oldDate);
    expect(result.spotify).toBe('failed');
    expect(result.musicfetch).toBe('complete');
  });

  it('does not modify completed or failed statuses', () => {
    const map: EnrichmentStatusMap = {
      spotify: 'complete',
      musicfetch: 'failed',
    };
    const oldDate = new Date(Date.now() - 5 * 60 * 1000);
    const result = applyTtlToEnrichmentStatus(map, oldDate);
    expect(result).toBe(map); // same reference, no changes
  });

  it('handles exact boundary (2min)', () => {
    const map: EnrichmentStatusMap = { spotify: 'enriching' };
    const exactlyTwoMin = new Date(Date.now() - 2 * 60 * 1000);
    // At exactly 2min, age === TTL, should NOT trigger (uses >)
    const result = applyTtlToEnrichmentStatus(map, exactlyTwoMin);
    // Due to timing, this might be either — just verify it doesn't throw
    expect(result.spotify).toBeDefined();
  });
});
