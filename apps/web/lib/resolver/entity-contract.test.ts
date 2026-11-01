import { describe, expect, it } from 'vitest';
import type { InHouseResolution } from '@/lib/music-resolver/in-house-contracts';
import {
  ENTITY_RESOLVER_CONTRACT,
  fromInHouseResolution,
} from './entity-contract';

const base: InHouseResolution = {
  status: 'resolved',
  kind: 'track',
  title: 'Take Me Over',
  artist: 'Tim White',
  isrc: 'USRC12345678',
  upc: null,
  mbid: null,
  links: [
    {
      provider: 'spotify',
      url: 'https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX',
      provenance: 'spotify_isrc',
      confidence: 0.92,
    },
  ],
  candidates: [],
  confidence: 0.92,
  provenance: {},
  candidateCount: 1,
};

describe('fromInHouseResolution', () => {
  it('maps a music track onto a general recording with identifiers and provenance', () => {
    const entity = fromInHouseResolution(base, '2026-10-29T00:00:00.000Z');
    expect(entity).toMatchObject({
      contract: ENTITY_RESOLVER_CONTRACT,
      kind: 'recording',
      identifiers: [{ namespace: 'isrc', value: 'USRC12345678' }],
      negativeEvidence: [],
    });
    expect(entity.links[0].provenance).toEqual({
      sourceId: 'spotify',
      method: 'spotify_isrc',
      observedAt: '2026-10-29T00:00:00.000Z',
    });
  });

  it('keeps abstention and candidates instead of picking one', () => {
    const entity = fromInHouseResolution({
      ...base,
      status: 'ambiguous',
      kind: 'artist',
      links: [],
      candidates: [
        {
          title: 'Tim White',
          artist: null,
          url: 'https://musicbrainz.org/artist/a',
        },
        {
          title: 'Tim White',
          artist: null,
          url: 'https://musicbrainz.org/artist/b',
        },
      ],
      candidateCount: 2,
    });
    expect(entity.kind).toBe('artist');
    expect(entity.candidates).toHaveLength(2);
    expect(entity.negativeEvidence).toEqual(['ambiguous:candidates=2']);
  });

  it('maps albums to releases', () => {
    expect(fromInHouseResolution({ ...base, kind: 'album' }).kind).toBe(
      'release'
    );
  });
});
