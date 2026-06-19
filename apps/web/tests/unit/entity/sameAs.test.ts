/**
 * Unit tests for buildEntitySameAs()
 *
 * Covers:
 * - Empty inputs → empty array
 * - MBID (via musicbrainz identity link) → canonical MB URI
 * - Wikidata QID → canonical Wikidata URI
 * - ISNI via externalId → canonical isni.org URI
 * - ISNI via url → stored URL used directly
 * - DSP profile columns (spotify, apple_music, youtube)
 * - Social links table
 * - Deduplication across all sources
 * - Non-sameAs platforms are excluded
 */

import { describe, expect, it } from 'vitest';
import {
  buildEntitySameAs,
  type EntityIdentityLink,
  type EntityProfile,
  type EntitySocialLink,
} from '@/lib/entity/sameAs';

const EMPTY_PROFILE: EntityProfile = {};
const NO_LINKS: EntityIdentityLink[] = [];
const NO_SOCIAL: EntitySocialLink[] = [];

describe('buildEntitySameAs', () => {
  it('returns empty array for all-empty inputs', () => {
    expect(buildEntitySameAs(EMPTY_PROFILE, NO_LINKS, NO_SOCIAL)).toEqual([]);
  });

  it('includes Wikidata canonical URI from identity link', () => {
    const links: EntityIdentityLink[] = [
      {
        platform: 'wikidata',
        url: 'https://www.wikidata.org/wiki/Q1234567',
        externalId: 'Q1234567',
      },
    ];
    const result = buildEntitySameAs(EMPTY_PROFILE, links, NO_SOCIAL);
    expect(result).toContain('https://www.wikidata.org/wiki/Q1234567');
  });

  it('includes ISNI canonical URI from externalId (16 digits)', () => {
    const links: EntityIdentityLink[] = [
      {
        platform: 'isni',
        url: 'https://isni.org/isni/0000000121032683',
        externalId: '0000000121032683',
      },
    ];
    const result = buildEntitySameAs(EMPTY_PROFILE, links, NO_SOCIAL);
    expect(result).toContain('https://isni.org/isni/0000000121032683');
  });

  it('normalizes ISNI with spaces in externalId', () => {
    const links: EntityIdentityLink[] = [
      {
        platform: 'isni',
        url: 'https://isni.org/isni/0000000121032683',
        externalId: '0000 0001 2103 2683',
      },
    ];
    const result = buildEntitySameAs(EMPTY_PROFILE, links, NO_SOCIAL);
    expect(result).toContain('https://isni.org/isni/0000000121032683');
  });

  it('falls back to url when ISNI externalId is absent', () => {
    const links: EntityIdentityLink[] = [
      {
        platform: 'isni',
        url: 'https://isni.org/isni/0000000121032683',
      },
    ];
    const result = buildEntitySameAs(EMPTY_PROFILE, links, NO_SOCIAL);
    expect(result).toContain('https://isni.org/isni/0000000121032683');
  });

  it('includes MusicBrainz URI from musicbrainz identity link', () => {
    const mbid = 'f4a31f0a-51dd-4fa7-986d-3095c40c5ed9';
    const links: EntityIdentityLink[] = [
      {
        platform: 'musicbrainz',
        url: `https://musicbrainz.org/artist/${mbid}`,
        externalId: mbid,
      },
    ];
    const result = buildEntitySameAs(EMPTY_PROFILE, links, NO_SOCIAL);
    expect(result).toContain(`https://musicbrainz.org/artist/${mbid}`);
  });

  it('includes Spotify URL from profile column', () => {
    const profile: EntityProfile = {
      spotifyUrl: 'https://open.spotify.com/artist/abc123',
    };
    const result = buildEntitySameAs(profile, NO_LINKS, NO_SOCIAL);
    expect(result).toContain('https://open.spotify.com/artist/abc123');
  });

  it('includes Apple Music and YouTube from profile columns', () => {
    const profile: EntityProfile = {
      appleMusicUrl: 'https://music.apple.com/artist/123',
      youtubeUrl: 'https://youtube.com/channel/456',
    };
    const result = buildEntitySameAs(profile, NO_LINKS, NO_SOCIAL);
    expect(result).toContain('https://music.apple.com/artist/123');
    expect(result).toContain('https://youtube.com/channel/456');
  });

  it('includes social links (instagram, twitter)', () => {
    const social: EntitySocialLink[] = [
      { platform: 'instagram', url: 'https://instagram.com/artist' },
      { platform: 'twitter', url: 'https://twitter.com/artist' },
    ];
    const result = buildEntitySameAs(EMPTY_PROFILE, NO_LINKS, social);
    expect(result).toContain('https://instagram.com/artist');
    expect(result).toContain('https://twitter.com/artist');
  });

  it('deduplicates when the same URL appears from multiple sources', () => {
    const profile: EntityProfile = {
      spotifyUrl: 'https://open.spotify.com/artist/abc123',
    };
    const links: EntityIdentityLink[] = [
      {
        platform: 'spotify',
        url: 'https://open.spotify.com/artist/abc123',
        externalId: 'abc123',
      },
    ];
    const social: EntitySocialLink[] = [
      { platform: 'spotify', url: 'https://open.spotify.com/artist/abc123' },
    ];
    const result = buildEntitySameAs(profile, links, social);
    expect(
      result.filter(u => u === 'https://open.spotify.com/artist/abc123')
    ).toHaveLength(1);
  });

  it('excludes non-sameAs platforms', () => {
    const links: EntityIdentityLink[] = [
      { platform: 'bandsintown', url: 'https://bandsintown.com/artist/123' },
    ];
    const result = buildEntitySameAs(EMPTY_PROFILE, links, NO_SOCIAL);
    // bandsintown is not in SAME_AS_PLATFORMS
    expect(result).not.toContain('https://bandsintown.com/artist/123');
  });

  it('includes all KB identifiers and DSP URLs together', () => {
    const mbid = 'abc-def-123';
    const profile: EntityProfile = {
      spotifyUrl: 'https://open.spotify.com/artist/spotid',
    };
    const links: EntityIdentityLink[] = [
      {
        platform: 'wikidata',
        url: 'https://www.wikidata.org/wiki/Q999',
        externalId: 'Q999',
      },
      {
        platform: 'isni',
        url: 'https://isni.org/isni/0000000100000001',
        externalId: '0000000100000001',
      },
      {
        platform: 'musicbrainz',
        url: `https://musicbrainz.org/artist/${mbid}`,
        externalId: mbid,
      },
    ];
    const result = buildEntitySameAs(profile, links, NO_SOCIAL);
    expect(result).toContain('https://www.wikidata.org/wiki/Q999');
    expect(result).toContain('https://isni.org/isni/0000000100000001');
    expect(result).toContain(`https://musicbrainz.org/artist/${mbid}`);
    expect(result).toContain('https://open.spotify.com/artist/spotid');
  });

  it('ignores ISNI externalId that is not 16 digits after normalization', () => {
    const links: EntityIdentityLink[] = [
      {
        platform: 'isni',
        url: 'https://isni.org/isni/badisni',
        externalId: 'short',
      },
    ];
    const result = buildEntitySameAs(EMPTY_PROFILE, links, NO_SOCIAL);
    // falls back to the url
    expect(result).toContain('https://isni.org/isni/badisni');
  });
});
