// The opt-in featured slot (Tim, 2026-11-08): demo artists until real artists
// opt in to be featured, then the top opted-in artists with certified content.
import { describe, expect, it } from 'vitest';
import {
  DEMO_ARTIST_IVO_LINDQVIST,
  HOMEPAGE_FEATURED_ARTIST,
  isDemoArtist,
} from '@/data/demoArtists';
import {
  FEATURED_ARTIST_OPT_INS,
  type FeaturedArtistOptIn,
  featuredArtistCertificationFailures,
  featuredArtistImages,
  selectFeaturedArtist,
} from '@/data/featuredArtists';
import { HOMEPAGE_EDITORIAL_COPY } from '@/data/homepageEditorialCopy';

// A fixture only: an invented artist shaped like a real opt-in.
function optIn(
  slug: string,
  rank: number,
  overrides: Partial<FeaturedArtistOptIn> = {}
): FeaturedArtistOptIn {
  const base = `/img/featured/${slug}`;
  const artist = {
    ...DEMO_ARTIST_IVO_LINDQVIST,
    demo: false as const,
    slug,
    name: `Fixture ${slug}`,
    avatarSrc: `${base}/avatar.webp`,
    releases: [
      { title: 'One', byline: slug, year: '2026', src: `${base}/one.webp` },
    ],
    inspected: {
      ...DEMO_ARTIST_IVO_LINDQVIST.inspected,
      src: `${base}/one.webp`,
    },
  };
  return {
    artist,
    optIn: {
      at: '2026-12-01',
      inArtistsWords: 'Yes, feature my profile on the Jovie homepage.',
      source: 'email to Jovie',
    },
    rank,
    certification: {
      certifiedAt: '2026-12-02',
      imageRights: featuredArtistImages(artist).map(src => ({
        src,
        holder: artist.name,
        basis: 'artist-owned' as const,
      })),
      peopleInImages: [],
      noUnapprovedClaims: true,
    },
    ...overrides,
  };
}

describe('featured artist slot', () => {
  it('shows the demo artist while no real artist is certified', () => {
    expect(FEATURED_ARTIST_OPT_INS.every(isCertified)).toBe(true);
    if (FEATURED_ARTIST_OPT_INS.length === 0) {
      expect(HOMEPAGE_FEATURED_ARTIST).toBe(DEMO_ARTIST_IVO_LINDQVIST);
      expect(isDemoArtist(HOMEPAGE_FEATURED_ARTIST)).toBe(true);
    }
  });

  it('features the best-ranked certified opt-in', () => {
    const picked = selectFeaturedArtist(
      [optIn('second', 2), optIn('first', 1)],
      DEMO_ARTIST_IVO_LINDQVIST
    );
    expect(picked.slug).toBe('first');
    expect(isDemoArtist(picked)).toBe(false);
  });

  it('skips an opt-in whose content is not certified', () => {
    const uncertified = optIn('waiting', 1, { certification: null });
    expect(featuredArtistCertificationFailures(uncertified)).toContain(
      'content is not certified'
    );
    expect(selectFeaturedArtist([uncertified], DEMO_ARTIST_IVO_LINDQVIST)).toBe(
      DEMO_ARTIST_IVO_LINDQVIST
    );
  });

  it('refuses an opt-in without the artist’s own words', () => {
    const record = optIn('quiet', 1);
    const failures = featuredArtistCertificationFailures({
      ...record,
      optIn: { ...record.optIn, inArtistsWords: ' ' },
    });
    expect(failures).toContain('opt-in is missing in the artist’s own words');
  });

  it('refuses an image with no rights entry', () => {
    const record = optIn('art', 1);
    const certification = record.certification;
    if (!certification) throw new Error('fixture is certified');
    const failures = featuredArtistCertificationFailures({
      ...record,
      certification: {
        ...certification,
        imageRights: certification.imageRights.slice(1),
      },
    });
    expect(failures).toContain(
      `no rights entry for ${record.artist.avatarSrc}`
    );
  });

  it('keeps every real person off the homepage', () => {
    const record = optIn('portrait', 1);
    const certification = record.certification;
    if (!certification) throw new Error('fixture is certified');
    const failures = featuredArtistCertificationFailures({
      ...record,
      certification: { ...certification, peopleInImages: ['someone'] },
    });
    expect(failures.join(' ')).toMatch(/admits no real person/);
  });

  it('refuses certification dated before the opt-in', () => {
    const record = optIn('early', 1);
    const certification = record.certification;
    if (!certification) throw new Error('fixture is certified');
    const failures = featuredArtistCertificationFailures({
      ...record,
      certification: { ...certification, certifiedAt: '2026-11-30' },
    });
    expect(failures).toContain(
      'content was certified before the artist opted in'
    );
  });

  it('stops calling a real featured artist an example', () => {
    // The copy says "an example artist" while the slot is a demo. When the
    // first real artist is featured, this fails until the copy names them.
    const copy = JSON.stringify(HOMEPAGE_EDITORIAL_COPY);
    if (!isDemoArtist(HOMEPAGE_FEATURED_ARTIST)) {
      expect(copy).not.toMatch(/example artist/i);
    }
  });
});

function isCertified(record: FeaturedArtistOptIn): boolean {
  return featuredArtistCertificationFailures(record).length === 0;
}
