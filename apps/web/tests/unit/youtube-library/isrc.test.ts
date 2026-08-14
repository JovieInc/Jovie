/**
 * Unit tests for ISRC extraction + release link resolution (JOV-5136)
 */

import { describe, expect, it } from 'vitest';
import {
  extractIsrcsFromText,
  resolveReleaseLink,
} from '@/lib/youtube-library/isrc';

const CATALOG = [
  {
    id: 'rec-1',
    isrc: 'USABC2600001',
    releaseId: 'rel-1',
    title: 'Neon Skyline',
  },
  { id: 'rec-2', isrc: 'GBXX12345678', releaseId: null, title: 'Midnight Run' },
  { id: 'rec-3', isrc: null, releaseId: 'rel-2', title: 'No ISRC Track' },
];

describe('extractIsrcsFromText', () => {
  it('extracts a single ISRC from a distributor block', () => {
    const text = 'Provided to YouTube by DistroKid\n\nISRC: USABC2600001\n';
    expect(extractIsrcsFromText(text)).toEqual(['USABC2600001']);
  });

  it('extracts multiple ISRCs and dedupes them', () => {
    const text = 'Tracks: USABC2600001, GBXX12345678, USABC2600001';
    expect(extractIsrcsFromText(text)).toEqual([
      'USABC2600001',
      'GBXX12345678',
    ]);
  });

  it('rejects malformed codes', () => {
    // lowercase, too short, lowercase country
    expect(extractIsrcsFromText('usabc2600001 USABC260001')).toEqual([]);
  });

  it('handles null/empty text', () => {
    expect(extractIsrcsFromText(null)).toEqual([]);
    expect(extractIsrcsFromText('')).toEqual([]);
  });
});

describe('resolveReleaseLink', () => {
  it('NEVER infers an ISRC from the title alone', () => {
    const result = resolveReleaseLink({
      video: {
        title: 'Neon Skyline (Official Music Video)',
        description: null,
      },
      catalog: CATALOG,
    });
    expect(result).toBeNull();
  });

  it('auto-approves when the description ISRC uniquely matches the catalog', () => {
    const result = resolveReleaseLink({
      video: {
        title: 'Neon Skyline',
        description: 'Provided to YouTube by X\nISRC USABC2600001',
      },
      catalog: CATALOG,
    });
    expect(result).not.toBeNull();
    expect(result?.status).toBe('approved');
    expect(result?.matchSource).toBe('distributor_data');
    expect(result?.confidence).toBe(0.95);
    expect(result?.isrc).toBe('USABC2600001');
    expect(result?.recordingId).toBe('rec-1');
    expect(result?.releaseId).toBe('rel-1');
  });

  it('marks an unknown description ISRC as pending_review with no ids', () => {
    const result = resolveReleaseLink({
      video: {
        title: 'Unknown Song',
        description: 'ISRC: FRZZZ9900001',
      },
      catalog: CATALOG,
    });
    expect(result?.status).toBe('pending_review');
    expect(result?.confidence).toBe(0.5);
    expect(result?.isrc).toBe('FRZZZ9900001');
    expect(result?.recordingId).toBeNull();
    expect(result?.releaseId).toBeNull();
  });

  it('marks multiple catalog matches as pending_review at lower confidence', () => {
    const dupeCatalog = [
      ...CATALOG,
      {
        id: 'rec-1b',
        isrc: 'USABC2600001',
        releaseId: 'rel-9',
        title: 'Neon Skyline (remaster)',
      },
    ];
    const result = resolveReleaseLink({
      video: {
        title: 'Neon Skyline',
        description: 'ISRC USABC2600001',
      },
      catalog: dupeCatalog,
    });
    expect(result?.status).toBe('pending_review');
    expect(result?.confidence).toBe(0.4);
    expect(result?.recordingId).toBeNull();
  });

  it('returns null when the description contains no ISRC', () => {
    const result = resolveReleaseLink({
      video: { title: 'Neon Skyline', description: 'New video out now!' },
      catalog: CATALOG,
    });
    expect(result).toBeNull();
  });

  it('uses the title only inside the rationale, never for selection', () => {
    const result = resolveReleaseLink({
      video: {
        title: 'Midnight Run',
        description: 'ISRC USABC2600001', // matches a DIFFERENT catalog title
      },
      catalog: CATALOG,
    });
    // Selected by ISRC, not by title.
    expect(result?.recordingId).toBe('rec-1');
    expect(result?.rationale).toContain('Midnight Run');
  });
});
