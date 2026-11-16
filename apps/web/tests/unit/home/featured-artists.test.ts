// The opt-in featured slot: the top opted-in artist with certified content,
// the demo artist when none is. Tim (2026-11-12): Tim, with his own catalog,
// for now, rotating to other artists by what converts later.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEMO_ARTIST_IVO_LINDQVIST,
  HOMEPAGE_FEATURED_ARTIST,
  isDemoArtist,
} from '@/data/demoArtists';
import {
  FEATURED_ARTIST_OPT_INS,
  FEATURED_ARTIST_TIM_WHITE,
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
  it('certifies every opt-in and features Tim with his own catalog for now', () => {
    for (const record of FEATURED_ARTIST_OPT_INS) {
      expect(
        featuredArtistCertificationFailures(record),
        record.artist.slug
      ).toEqual([]);
    }
    expect(HOMEPAGE_FEATURED_ARTIST).toBe(FEATURED_ARTIST_TIM_WHITE.artist);
    expect(isDemoArtist(HOMEPAGE_FEATURED_ARTIST)).toBe(false);
    expect(HOMEPAGE_FEATURED_ARTIST.inspected.title).toBe('Supernova Girl');
  });

  it('falls back to the demo artist when no opt-in is certified', () => {
    expect(selectFeaturedArtist([], DEMO_ARTIST_IVO_LINDQVIST)).toBe(
      DEMO_ARTIST_IVO_LINDQVIST
    );
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

  it('admits only the artist themselves in the images', () => {
    const record = optIn('portrait', 1, { artistPersonId: 'portrait' });
    const certification = record.certification;
    if (!certification) throw new Error('fixture is certified');
    const self = featuredArtistCertificationFailures({
      ...record,
      certification: { ...certification, peopleInImages: ['portrait'] },
    });
    expect(self).toEqual([]);
    const failures = featuredArtistCertificationFailures({
      ...record,
      certification: { ...certification, peopleInImages: ['someone'] },
    });
    expect(failures.join(' ')).toMatch(/someone other than the artist/);
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

  it('backs every opt-in with the approved-people registry', () => {
    // The record's people are declarations; the registry is the evidence.
    const registry = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          '../../scripts/invariants/art-direction/approved-people.json'
        ),
        'utf8'
      )
    ) as {
      people: { id: string }[];
      images: {
        path: string;
        person: string;
        routes: string[];
        homepage?: { at?: string; inTheirWords?: string };
      }[];
    };
    const approved = new Set(registry.people.map(person => person.id));
    for (const record of FEATURED_ARTIST_OPT_INS) {
      const declared = record.certification?.peopleInImages ?? [];
      for (const person of declared) {
        expect(approved.has(person), `${record.artist.slug}: ${person}`).toBe(
          true
        );
      }
      const shown = new Set<string>();
      for (const src of featuredArtistImages(record.artist)) {
        const image = registry.images.find(
          entry => entry.path === `apps/web/public${src}`
        );
        if (!image) continue;
        shown.add(image.person);
        expect(declared, src).toContain(image.person);
        expect(image.routes, src).toContain('/');
        expect(image.homepage?.inTheirWords?.trim(), src).toBeTruthy();
        expect(Date.parse(image.homepage?.at ?? ''), src).not.toBeNaN();
      }
      // A declared person with no registered slot image is a stale claim.
      expect([...shown].sort(), record.artist.slug).toEqual(
        [...declared].sort()
      );
    }
  });
});
