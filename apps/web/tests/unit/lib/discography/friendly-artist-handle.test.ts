import { describe, expect, it } from 'vitest';

import {
  composeFriendlyArtistHandleCandidates,
  normalizeArtistNameToHandleBase,
} from '@/lib/discography/friendly-artist-handle';

describe('normalizeArtistNameToHandleBase', () => {
  it('lowercases, strips punctuation, and collapses separators', () => {
    expect(normalizeArtistNameToHandleBase('Fedde Le Grand')).toBe(
      'fedde-le-grand'
    );
    expect(normalizeArtistNameToHandleBase('  AC/DC!  ')).toBe('ac-dc');
    expect(normalizeArtistNameToHandleBase("N*i$ha O'Connor")).toBe(
      'niha-oconnor'
    );
  });

  it('transliterates accented characters and drops non-Latin scripts observably', () => {
    expect(normalizeArtistNameToHandleBase('Björk')).toBe('bjork');
    expect(normalizeArtistNameToHandleBase('Sigur Rós')).toBe('sigur-ros');
    expect(normalizeArtistNameToHandleBase('坂本龍一')).toBe('');
  });
});

describe('composeFriendlyArtistHandleCandidates', () => {
  it('ranks the joined full name above the primary token (Fedde Le Grand)', () => {
    const result = composeFriendlyArtistHandleCandidates({
      registryName: 'Fedde Le Grand',
      providerArtist: { id: 'sp-1', name: 'Fedde Le Grand' },
    });

    expect(result.accepted[0]?.handle).toBe('feddelegrand');
    expect(result.accepted[0]?.source).toBe('registry_artist_name');
    expect(result.accepted[1]?.handle).toBe('fedde');
    // Duplicate provider signal collapses to the same accepted handles.
    expect(
      result.accepted.filter(c => c.handle === 'feddelegrand')
    ).toHaveLength(1);
    expect(result.rejected).toEqual([]);
  });

  it('keeps distinct candidates when provider and registry names disagree', () => {
    const result = composeFriendlyArtistHandleCandidates({
      registryName: 'Tim White',
      providerArtist: { id: 'sp-2', name: 'Tim White (Official)' },
    });

    expect(result.accepted.map(c => c.handle)).toEqual([
      'timwhite',
      'tim',
      'timwhiteofficial',
    ]);
    // The provider's parenthetical form never outranks the canonical name.
    expect(result.accepted[0]?.source).toBe('registry_artist_name');
  });

  it('does not copy a social handle it was never given', () => {
    // Only names are composed; social handles are never an input here.
    const result = composeFriendlyArtistHandleCandidates({
      registryName: 'Tim White',
      providerArtist: { id: 'sp-2', name: 'Tim White' },
    });
    expect(result.accepted.map(c => c.handle)).not.toContain('itstimwhite');
  });

  it('rejects punctuation-only and non-Latin names observably', () => {
    const result = composeFriendlyArtistHandleCandidates({
      registryName: '坂本龍一',
      providerArtist: { id: 'sp-3', name: '???' },
    });

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([
      {
        handle: '坂本龍一',
        source: 'registry_artist_name',
        reason: 'empty_after_normalization',
      },
      {
        handle: '???',
        source: 'provider_display_name',
        reason: 'empty_after_normalization',
      },
    ]);
  });

  it('records candidates that violate the canonical username contract', () => {
    // "Top" is in RESERVED_USERNAMES; the single-token form must be rejected,
    // not silently ranked.
    const result = composeFriendlyArtistHandleCandidates({
      registryName: 'Top',
      providerArtist: undefined,
    });
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([
      {
        handle: 'top',
        source: 'registry_artist_name',
        reason: 'fails_username_contract',
      },
    ]);
  });

  it('ranks artist-controlled destination handles from the JOV-6529 enrichment pass', () => {
    const result = composeFriendlyArtistHandleCandidates({
      // Registry/provider names normalize to a reserved word; only the
      // verified destination handle supplies a friendly candidate.
      registryName: 'Top',
      providerArtist: { id: 'sp-1', name: 'Top' },
      evidenceHandles: ['thecollective'],
    });

    expect(result.accepted).toEqual([
      {
        rank: 0,
        handle: 'thecollective',
        source: 'artist_controlled_destination',
      },
    ]);
  });

  it('dedupes a destination handle that matches the composed name form', () => {
    const result = composeFriendlyArtistHandleCandidates({
      registryName: 'Fedde Le Grand',
      providerArtist: undefined,
      evidenceHandles: ['feddelegrand'],
    });
    expect(
      result.accepted.filter(c => c.handle === 'feddelegrand')
    ).toHaveLength(1);
  });

  it('produces identical output for identical inputs (pure/deterministic)', () => {
    const input = {
      registryName: 'Fedde Le Grand',
      providerArtist: { id: 'sp-1', name: 'Fedde Le Grand' },
    } as const;
    expect(composeFriendlyArtistHandleCandidates(input)).toEqual(
      composeFriendlyArtistHandleCandidates(input)
    );
  });
});
