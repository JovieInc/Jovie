import { describe, expect, it } from 'vitest';

import {
  type CatalogRecordingEvidence,
  detectCatalogSplit,
  type ProviderArtistObservation,
  type SplitCatalogScanInput,
} from '@/lib/dsp-enrichment/matching/split-catalog';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const PRIMARY_ID = '859547284';
const SECONDARY_ID = '1508274696';

function observation(
  overrides: Partial<ProviderArtistObservation> = {}
): ProviderArtistObservation {
  return {
    provider: 'apple_music',
    providerArtistId: PRIMARY_ID,
    displayedName: 'Tim White',
    url: `https://music.apple.com/us/artist/tim-white/${PRIMARY_ID}`,
    storefront: 'us',
    observedAt: '2026-09-22T00:00:00Z',
    fetchStatus: 'ok',
    ...overrides,
  };
}

function recording(
  overrides: Partial<CatalogRecordingEvidence> = {}
): CatalogRecordingEvidence {
  return {
    id: 'rec-1',
    title: 'Take Me Over',
    approvedForArtist: true,
    credits: [{ name: 'Tim White', providerArtistId: PRIMARY_ID }],
    ...overrides,
  };
}

function scan(overrides: Partial<SplitCatalogScanInput> = {}) {
  return detectCatalogSplit({
    provider: 'apple_music',
    artistName: 'Tim White',
    primaryProviderArtistId: PRIMARY_ID,
    recordings: [],
    observations: [observation()],
    ...overrides,
  });
}

/**
 * Tim White dogfood case (JOV-6527): the primary page holds Take Me
 * Over / Sober / etc.; a second artist page holds Wheels Up and its
 * remix, both co-credited to Lynx.
 */
function timWhiteFixtures() {
  const primary = observation();
  const secondary = observation({
    providerArtistId: SECONDARY_ID,
    url: `https://music.apple.com/us/artist/tim-white/${SECONDARY_ID}`,
    bio: 'Singer, songwriter and founder.',
  });
  primary.bio = 'Singer, songwriter and founder.';

  const recordings: CatalogRecordingEvidence[] = [
    recording({
      id: 'take-me-over',
      title: 'Take Me Over',
      isrc: 'USAB10000001',
    }),
    recording({ id: 'sober', title: 'Sober' }),
    recording({
      id: 'wheels-up',
      title: 'Wheels Up',
      isrc: 'USAB10000002',
      upc: '000000001',
      providerUrl:
        'https://music.apple.com/us/album/wheels-up-single/1690400377',
      credits: [
        { name: 'Lynx', providerArtistId: '999' },
        { name: 'Tim White', providerArtistId: SECONDARY_ID },
      ],
    }),
    recording({
      id: 'wheels-up-remix',
      title: 'Wheels Up (Dark Intensity Remix)',
      providerUrl:
        'https://music.apple.com/us/album/wheels-up-dark-intensity-remix-single/1690407796',
      credits: [
        { name: 'Lynx', providerArtistId: '999' },
        { name: 'Tim White', providerArtistId: SECONDARY_ID },
      ],
    }),
  ];

  return { primary, secondary, recordings };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectCatalogSplit', () => {
  it('detects the Tim White split across two Apple Music artist IDs', () => {
    const { primary, secondary, recordings } = timWhiteFixtures();
    const result = scan({
      recordings,
      observations: [primary, secondary],
    });

    expect(result.state).toBe('split_detected');
    expect(result.primaryProviderArtistId).toBe(PRIMARY_ID);
    expect(result.candidates).toHaveLength(1);

    const candidate = result.candidates[0];
    expect(candidate.providerArtistId).toBe(SECONDARY_ID);
    expect(candidate.url).toBe(
      `https://music.apple.com/us/artist/tim-white/${SECONDARY_ID}`
    );
    // Both affected release URLs are surfaced.
    expect(candidate.affectedRecordings.map(r => r.providerUrl)).toEqual([
      'https://music.apple.com/us/album/wheels-up-single/1690400377',
      'https://music.apple.com/us/album/wheels-up-dark-intensity-remix-single/1690407796',
    ]);
    // Lynx's co-credit is preserved, never treated as a split ID.
    expect(candidate.affectedRecordings[0].coArtists).toEqual(['Lynx']);
    // Shared ISRC makes the evidence high confidence; shared bio corroborates.
    expect(candidate.confidence).toBe('high');
    expect(candidate.evidence.map(e => e.kind)).toContain('shared_isrc');
    expect(candidate.evidence.map(e => e.kind)).toContain('shared_biography');
  });

  it('produces a stable dedupe caseKey across scans', () => {
    const { primary, secondary, recordings } = timWhiteFixtures();
    const a = scan({ recordings, observations: [primary, secondary] });
    const b = scan({
      recordings: [...recordings].reverse(),
      observations: [secondary, primary],
    });
    expect(a.caseKey).toBe(b.caseKey);
    expect(a.caseKey).toContain(PRIMARY_ID);
    expect(a.caseKey).toContain(SECONDARY_ID);
  });

  it('reports no_split when all approved recordings share one artist ID', () => {
    const { primary } = timWhiteFixtures();
    const result = scan({
      recordings: [
        recording({ id: 'a', title: 'Take Me Over' }),
        recording({ id: 'b', title: 'Sober' }),
      ],
      observations: [primary],
    });
    expect(result.state).toBe('no_split');
    expect(result.candidates).toHaveLength(0);
  });

  it('ignores an unrelated same-name artist (namesake noise)', () => {
    const primary = observation();
    const namesake = observation({
      providerArtistId: '777',
      displayedName: 'Tim White',
      url: 'https://music.apple.com/us/artist/tim-white/777',
    });
    const result = scan({
      recordings: [
        recording({ id: 'mine', title: 'Sober' }),
        // The namesake's release is not approved for this artist.
        recording({
          id: 'theirs',
          title: 'Different Tim White Song',
          approvedForArtist: false,
          credits: [{ name: 'Tim White', providerArtistId: '777' }],
        }),
      ],
      observations: [primary, namesake],
    });
    expect(result.state).toBe('no_split');
    expect(result.candidates).toHaveLength(0);
  });

  it('treats one person with founder + artist roles as a single identity', () => {
    const { primary, secondary } = timWhiteFixtures();
    // Same artist; roles differ, but the catalog split is still real.
    const result = scan({
      recordings: [
        recording({ id: 'sober', title: 'Sober' }),
        recording({
          id: 'wheels-up',
          title: 'Wheels Up',
          isrc: 'USAB10000002',
          credits: [
            { name: 'Lynx', providerArtistId: '999' },
            { name: 'Tim White', providerArtistId: SECONDARY_ID },
          ],
        }),
      ],
      observations: [primary, secondary],
    });
    expect(result.state).toBe('split_detected');
    expect(result.candidates[0].providerArtistId).toBe(SECONDARY_ID);
  });

  it('never creates a candidate from shared biography alone', () => {
    const primary = observation({ bio: 'Identical bio text.' });
    const other = observation({
      providerArtistId: '888',
      bio: 'Identical bio text.',
    });
    const result = scan({
      recordings: [recording({ id: 'sober' })],
      observations: [primary, other],
    });
    expect(result.state).toBe('no_split');
    expect(result.candidates).toHaveLength(0);
  });

  it('returns unknown (never clean) when an observation failed', () => {
    const { primary, recordings } = timWhiteFixtures();
    const failed = observation({
      providerArtistId: SECONDARY_ID,
      fetchStatus: 'failed',
    });
    const result = scan({
      recordings: recordings.filter(r =>
        ['take-me-over', 'sober'].includes(r.id)
      ),
      observations: [primary, failed],
    });
    expect(result.state).toBe('unknown');
    expect(result.incompleteEvidence).toBe(true);
  });

  it('returns unknown when observations are stale', () => {
    const primary = observation();
    const stale = observation({
      providerArtistId: SECONDARY_ID,
      fetchStatus: 'stale',
    });
    const result = scan({
      recordings: [recording({ id: 'sober' })],
      observations: [primary, stale],
    });
    expect(result.state).toBe('unknown');
  });

  it('flags insufficient evidence as unknown', () => {
    const result = scan({ recordings: [] });
    expect(result.state).toBe('unknown');
  });

  it('still reports a detected split alongside incomplete evidence', () => {
    const { primary, secondary, recordings } = timWhiteFixtures();
    const failedExtra = observation({
      providerArtistId: '12345',
      displayedName: 'Tim White',
      fetchStatus: 'failed',
    });
    const result = scan({
      recordings,
      observations: [primary, secondary, failedExtra],
    });
    expect(result.state).toBe('split_detected');
    expect(result.incompleteEvidence).toBe(true);
    // The unreachable page is not asserted as part of the split.
    expect(result.candidates.map(c => c.providerArtistId)).toEqual([
      SECONDARY_ID,
    ]);
  });

  it('keeps credit for the scanned artist, not their collaborator', () => {
    // Scanning Lynx's catalog: Wheels Up credits Lynx on ID 999.
    const result = detectCatalogSplit({
      provider: 'apple_music',
      artistName: 'Lynx',
      recordings: [
        {
          id: 'wheels-up',
          title: 'Wheels Up',
          approvedForArtist: true,
          credits: [
            { name: 'Lynx', providerArtistId: '999' },
            { name: 'Tim White', providerArtistId: SECONDARY_ID },
          ],
        },
      ],
      observations: [
        observation({
          providerArtistId: '999',
          displayedName: 'Lynx',
        }),
      ],
    });
    expect(result.state).toBe('no_split');
  });
});
