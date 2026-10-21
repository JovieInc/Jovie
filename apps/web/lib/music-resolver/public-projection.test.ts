import { describe, expect, it } from 'vitest';
import type { InHouseResolution } from './in-house-contracts';
import { projectPublicMusic } from './public-projection';

const empty: InHouseResolution = {
  status: 'resolved',
  kind: 'track',
  title: 'Track',
  artist: 'Artist',
  isrc: 'USABC1234567',
  upc: null,
  mbid: null,
  links: [],
  candidates: [],
  confidence: 0,
  candidateCount: 0,
  provenance: {},
};
const link = (url: string, provider = 'spotify', provenance = 'input_url') => ({
  provider,
  url,
  provenance,
  confidence: 0.8,
});

describe('core public music projection', () => {
  it.each([
    ['https://instagram.com/artist', 'instagram', 'input_url'],
    ['https://tiktok.com/@artist', 'tiktok', 'musicbrainz_url_rel'],
    ['https://unknown.example/artist', 'unknown', 'input_url'],
    ['https://instagram.com/artist', 'spotify', 'input_url'],
    [
      'https://open.spotify.com.attacker.example/artist',
      'spotify',
      'input_url',
    ],
    ['https://attacker.open.spotify.com/artist', 'spotify', 'input_url'],
    ['http://open.spotify.com/artist/123', 'spotify', 'input_url'],
    [
      [
        'https://fixture-user',
        ':fixture-password@open.spotify.com/artist/123',
      ].join(''),
      'spotify',
      'input_url',
    ],
    ['https://open.spotify.com:444/artist/123', 'spotify', 'input_url'],
    ['javascript:alert(1)', 'spotify', 'input_url'],
    ['not a url', 'spotify', 'input_url'],
    [
      'https://open.spotify.com/artist/123',
      'spotify',
      'private-provider-token',
    ],
    ['https://open.spotify.com/artist/123', 'spotify', 'unreviewed_source'],
  ])(
    'denies destination/provenance expansion: %s (%s, %s)',
    (url, provider, provenance) => {
      const projected = projectPublicMusic({
        ...empty,
        links: [link(url, provider, provenance)],
        provenance: { [provider]: provenance },
        candidateCount: 99,
        confidence: 1,
      });
      expect(projected).toMatchObject({
        status: 'no_match',
        links: [],
        provenance: {},
        candidateCount: 0,
        confidence: 0,
      });
    }
  );

  it('strips URL query credentials/fragments and preserves Apple track identity', () => {
    const projected = projectPublicMusic({
      ...empty,
      links: [
        link('https://open.spotify.com/track/123?access_token=private#private'),
        link(
          'https://music.apple.com/us/album/title/123?i=456&token=private#private',
          'apple_music'
        ),
      ],
    });
    expect(projected.links.map(item => item.url)).toEqual([
      'https://open.spotify.com/track/123',
      'https://music.apple.com/us/album/title/123?i=456',
    ]);
    expect(JSON.stringify(projected)).not.toContain('private');
  });

  it('retains real core ambiguity choices while filtering joined graph candidates', () => {
    const candidate = (url: string) => ({
      title: 'Artist',
      artist: null,
      url,
      graph: 'private',
    });
    const projected = projectPublicMusic({
      ...empty,
      kind: 'artist',
      status: 'ambiguous',
      candidates: [
        candidate(
          'https://musicbrainz.org/artist/51972833-bb04-46b7-9401-45a5ab449ebd'
        ),
        candidate('https://open.spotify.com/artist/123?token=private'),
        candidate('https://instagram.com/private'),
        candidate('https://private.example/artist'),
        candidate(
          [
            'https://fixture-user',
            ':fixture-password@musicbrainz.org/artist/abc',
          ].join('')
        ),
      ],
    });
    expect(projected.status).toBe('ambiguous');
    expect(projected.candidateCount).toBe(2);
    expect(projected.candidates).toEqual([
      {
        title: 'Artist',
        artist: null,
        url: 'https://musicbrainz.org/artist/51972833-bb04-46b7-9401-45a5ab449ebd',
      },
      {
        title: 'Artist',
        artist: null,
        url: 'https://open.spotify.com/artist/123',
      },
    ]);
    expect(projectPublicMusic({ ...empty, status: 'ambiguous' }).status).toBe(
      'no_match'
    );
  });

  it('preserves an exact MusicBrainz identity without outbound links', () => {
    expect(
      projectPublicMusic({
        ...empty,
        kind: 'artist',
        mbid: '51972833-bb04-46b7-9401-45a5ab449ebd',
      }).status
    ).toBe('resolved');
  });
});
