import { describe, expect, it } from 'vitest';

import {
  buildNotCheckedIdentityReceipt,
  buildUnclaimedIdentityEnrichmentReceipt,
  evaluateUnclaimedArtistIdentity,
  getUnclaimedIdentityStatus,
  type IdentityObservation,
  isUnclaimedProfileShareReady,
  observationsFromMusicFetchArtist,
  readUnclaimedIdentityEnrichment,
  UNCLAIMED_IDENTITY_ENRICHMENT_KEY,
} from '@/lib/discography/unclaimed-artist-identity';

const T1 = '2026-09-26T10:00:00.000Z';
const T2 = '2026-09-26T11:00:00.000Z';

function obs(
  source: string,
  url: string,
  observedAt: string = T1
): IdentityObservation {
  return { source, url, observedAt };
}

describe('evaluateUnclaimedArtistIdentity', () => {
  it('verifies all high-confidence artist-controlled destinations for a known artist', () => {
    const evaluation = evaluateUnclaimedArtistIdentity([
      obs(
        'structured_spotify_release_credit',
        'https://open.spotify.com/artist/fedde'
      ),
      obs('musicfetch', 'https://open.spotify.com/artist/fedde'),
      obs('musicfetch', 'https://instagram.com/feddelegrand'),
      obs('musicfetch', 'https://youtube.com/@feddelegrand'),
      obs('musicfetch', 'https://www.feddelegrand.com'),
    ]);

    expect(evaluation.status).toBe('verified');
    const verified = evaluation.links.filter(l => l.status === 'verified');
    expect(verified.map(l => l.platform).sort()).toEqual(
      expect.arrayContaining(['instagram', 'spotify', 'website'])
    );
    // The Spotify URL dedupes to one canonical link with both sources.
    const spotify = verified.find(l => l.platform === 'spotify');
    expect(spotify?.sources).toEqual([
      'musicfetch',
      'structured_spotify_release_credit',
    ]);
    expect(evaluation.handleEvidence).toContain('feddelegrand');
    expect(evaluation.conflicts).toEqual([]);
  });

  it('drops fan pages and label/fan-club handles instead of promoting them', () => {
    const evaluation = evaluateUnclaimedArtistIdentity([
      obs(
        'structured_spotify_release_credit',
        'https://open.spotify.com/artist/fedde'
      ),
      obs('musicfetch', 'https://instagram.com/feddelegrandfans'),
      obs('musicfetch', 'https://facebook.com/feddelegrand.fanpage'),
      obs('musicfetch', 'https://instagram.com/feddelegrand'),
    ]);

    const instagramLinks = evaluation.links.filter(
      l => l.platform === 'instagram'
    );
    expect(instagramLinks).toHaveLength(1);
    expect(instagramLinks[0]?.url).toContain('feddelegrand');
    expect(instagramLinks[0]?.url).not.toContain('fans');
    expect(evaluation.handleEvidence).not.toContain('feddelegrandfans');
    expect(evaluation.handleEvidence).not.toContain('feddelegrand.fanpage');
    expect(evaluation.status).toBe('verified');
  });

  it('never infers destinations from display-name similarity (name collisions)', () => {
    // Two real artists share the display name "Oaks". Artist B's entity
    // lookup returns no socials — the evaluation must NOT borrow artist A's
    // instagram just because the names match.
    const evaluationB = evaluateUnclaimedArtistIdentity([
      obs(
        'structured_spotify_release_credit',
        'https://open.spotify.com/artist/oaks-b'
      ),
    ]);

    expect(evaluationB.status).toBe('verified'); // seed link only
    expect(evaluationB.links.map(l => l.platform)).toEqual(['spotify']);
    expect(evaluationB.handleEvidence).toEqual([]);
  });

  it('marks stale single-source handle disagreements as conflicted', () => {
    const evaluation = evaluateUnclaimedArtistIdentity([
      obs(
        'structured_spotify_release_credit',
        'https://open.spotify.com/artist/fedde'
      ),
      obs('musicfetch', 'https://instagram.com/feddelegrand', T2),
      obs('legacy_import', 'https://instagram.com/feddelegrand_old', T1),
    ]);

    expect(evaluation.status).toBe('conflicted');
    const conflict = evaluation.conflicts.find(c => c.platform === 'instagram');
    expect(conflict?.resolvedUrl).toBeNull();
    expect(conflict?.urls).toHaveLength(2);
    // No stale handle leaks into composer evidence.
    expect(evaluation.handleEvidence).not.toContain('feddelegrand_old');
  });

  it('resolves disagreement by corroboration and records the loser', () => {
    const evaluation = evaluateUnclaimedArtistIdentity([
      obs(
        'structured_spotify_release_credit',
        'https://open.spotify.com/artist/fedde'
      ),
      obs('musicfetch', 'https://instagram.com/feddelegrand'),
      obs('musicbrainz', 'https://instagram.com/feddelegrand'),
      obs('legacy_import', 'https://instagram.com/feddelegrand_old'),
    ]);

    expect(evaluation.status).toBe('verified');
    const instagram = evaluation.links.find(
      l => l.platform === 'instagram' && l.status === 'verified'
    );
    expect(instagram?.url).toContain('instagram.com/feddelegrand');
    expect(instagram?.sources).toEqual(['musicbrainz', 'musicfetch']);
    const conflict = evaluation.conflicts.find(c => c.platform === 'instagram');
    expect(conflict?.resolvedUrl).toContain('instagram.com/feddelegrand');
  });

  it('accepts multiple official artist domains', () => {
    const evaluation = evaluateUnclaimedArtistIdentity([
      obs(
        'structured_spotify_release_credit',
        'https://open.spotify.com/artist/fedde'
      ),
      obs('musicfetch', 'https://www.feddelegrand.com'),
      obs('musicfetch', 'https://feddelegrand.nl'),
    ]);

    const websites = evaluation.links.filter(l => l.platform === 'website');
    expect(websites).toHaveLength(2);
    expect(websites.every(l => l.status === 'verified')).toBe(true);
    expect(evaluation.conflicts).toEqual([]);
    expect(evaluation.status).toBe('verified');
  });

  it('reports not_found when no usable destinations exist', () => {
    const evaluation = evaluateUnclaimedArtistIdentity([
      obs('musicfetch', 'not-a-url'),
      obs('musicfetch', 'https://instagram.com/feddelegrandfans'),
    ]);
    expect(evaluation.status).toBe('not_found');
    expect(evaluation.links).toEqual([]);
  });
});

describe('observationsFromMusicFetchArtist', () => {
  it('projects every service URL with provenance and seeds the Spotify credit', () => {
    const observations = observationsFromMusicFetchArtist(
      {
        services: {
          spotify: { link: 'https://open.spotify.com/artist/fedde' },
          appleMusic: {
            link: 'https://music.apple.com/us/artist/fedde-le-grand/12345',
            id: '12345',
          },
          instagram: { url: 'https://instagram.com/feddelegrand' },
          empty: {},
        },
      },
      'https://open.spotify.com/artist/fedde',
      T1
    );

    expect(observations[0]).toMatchObject({
      source: 'structured_spotify_release_credit',
      url: 'https://open.spotify.com/artist/fedde',
    });
    expect(observations.filter(o => o.source === 'musicfetch')).toHaveLength(3);
    expect(observations.find(o => o.url.includes('apple'))?.externalId).toBe(
      '12345'
    );
    expect(observations.every(o => o.observedAt === T1)).toBe(true);
  });
});

describe('enrichment receipt', () => {
  it('round-trips through profile settings with share-ready evidence contract', () => {
    const evaluation = evaluateUnclaimedArtistIdentity([
      obs(
        'structured_spotify_release_credit',
        'https://open.spotify.com/artist/fedde'
      ),
      obs('musicfetch', 'https://instagram.com/feddelegrand'),
    ]);
    const receipt = buildUnclaimedIdentityEnrichmentReceipt(evaluation, {
      providerArtistId: 'spotify-fedde',
      observedAt: T1,
    });

    expect(receipt.status).toBe('verified');
    expect(receipt.shareReady).toBe(true);
    expect(receipt.provider).toBe('spotify');
    expect(receipt.providerArtistId).toBe('spotify-fedde');

    const settings = { [UNCLAIMED_IDENTITY_ENRICHMENT_KEY]: receipt };
    expect(readUnclaimedIdentityEnrichment(settings)).toEqual(receipt);
    expect(isUnclaimedProfileShareReady(settings)).toBe(true);
    expect(getUnclaimedIdentityStatus(settings)).toBe('verified');
  });

  it('is not share-ready when only the source provider link exists', () => {
    const evaluation = evaluateUnclaimedArtistIdentity([
      obs(
        'structured_spotify_release_credit',
        'https://open.spotify.com/artist/oaks-b'
      ),
    ]);
    const receipt = buildUnclaimedIdentityEnrichmentReceipt(evaluation, {
      providerArtistId: 'spotify-oaks-b',
      observedAt: T1,
    });
    expect(receipt.shareReady).toBe(false);
    expect(
      isUnclaimedProfileShareReady({
        [UNCLAIMED_IDENTITY_ENRICHMENT_KEY]: receipt,
      })
    ).toBe(false);
  });

  it('treats missing or malformed receipts as not_checked', () => {
    expect(getUnclaimedIdentityStatus(null)).toBe('not_checked');
    expect(getUnclaimedIdentityStatus({})).toBe('not_checked');
    expect(
      getUnclaimedIdentityStatus({
        [UNCLAIMED_IDENTITY_ENRICHMENT_KEY]: { status: 'bogus' },
      })
    ).toBe('not_checked');
    expect(isUnclaimedProfileShareReady({})).toBe(false);
  });

  it('builds a valid not_checked receipt for pre-enrichment profiles', () => {
    const receipt = buildNotCheckedIdentityReceipt({
      providerArtistId: 'spotify-fedde',
      observedAt: T1,
    });
    const settings = { [UNCLAIMED_IDENTITY_ENRICHMENT_KEY]: receipt };
    expect(readUnclaimedIdentityEnrichment(settings)?.status).toBe(
      'not_checked'
    );
  });
});
