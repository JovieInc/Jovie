/**
 * Invented demo artists for marketing surfaces.
 *
 * Tim (2026-11-08): the homepage should not feature him. Until real artists
 * opt in to be featured, it shows invented artists with realistic-looking
 * profiles; then it switches to the top real artists who opt in, with their
 * content certified.
 *
 * Rules for every entry here:
 * - `demo: true`. Nothing in this file is a real person, artist, label or
 *   release. Swap a slot to a real artist only through an opt-in record.
 * - Names were searched before use and match no artist we could find.
 * - Imagery is rendered procedurally as photographic night stills by
 *   `scripts/demo-artists/render-demo-covers.py`:
 *   no people, no faces, no text (approved-people.json: no real person on `/`).
 * - No testimonials, follower counts, revenue or other performance claims.
 * - Barcodes use the GS1 restricted-circulation prefix 2, which is never
 *   assigned to a real retail product.
 */

import {
  FEATURED_ARTIST_OPT_INS,
  type FeaturedArtistProfile,
  type FeaturedArtistRelease,
  selectFeaturedArtist,
} from '@/data/featuredArtists';

export type DemoArtistRelease = FeaturedArtistRelease;

export interface DemoArtist extends FeaturedArtistProfile {
  readonly demo: true;
}

const IVO = '/img/demo-artists/ivo-lindqvist';

export const DEMO_ARTIST_IVO_LINDQVIST: DemoArtist = {
  demo: true,
  slug: 'ivo-lindqvist',
  name: 'Ivo Lindqvist',
  handle: 'ivolindqvist',
  profileDisplay: 'jov.ie/ivolindqvist',
  avatarSrc: `${IVO}/avatar.webp`,
  releases: [
    {
      title: 'Slow Weather',
      byline: 'Ivo Lindqvist',
      year: '2026',
      src: `${IVO}/slow-weather.webp`,
    },
    {
      title: 'Night Ferry',
      byline: 'Club Mix · Ivo Lindqvist',
      year: '2025',
      src: `${IVO}/night-ferry.webp`,
    },
    {
      title: 'Glass Coast',
      byline: 'Ivo Lindqvist',
      year: '2025',
      src: `${IVO}/glass-coast.webp`,
    },
    {
      title: 'Paper Satellites',
      byline: 'Ivo Lindqvist',
      year: '2024',
      src: `${IVO}/paper-satellites.webp`,
    },
    {
      title: 'Low Sun',
      byline: 'Ivo Lindqvist',
      year: '2024',
      src: `${IVO}/low-sun.webp`,
    },
    {
      title: 'First Frost',
      byline: 'Ivo Lindqvist',
      year: '2023',
      src: `${IVO}/first-frost.webp`,
    },
  ],
  inspected: {
    title: 'Low Sun',
    src: `${IVO}/low-sun.webp`,
    date: 'Mar 6',
    type: 'Single',
    tracks: '1',
    duration: '3:41',
    genres: ['Melodic House', 'Ambient'],
    label: 'Self-released',
    upc: '2004183075211',
  },
};

/**
 * The artist the homepage features: the best-ranked real artist who opted in
 * and passed certification (`data/featuredArtists.ts`), otherwise the demo
 * artist. No real artist has opted in yet, so this is Ivo Lindqvist.
 */
export const HOMEPAGE_FEATURED_ARTIST: FeaturedArtistProfile =
  selectFeaturedArtist(FEATURED_ARTIST_OPT_INS, DEMO_ARTIST_IVO_LINDQVIST);

/** True when a featured slot still shows an invented artist. */
export function isDemoArtist(artist: { readonly demo?: boolean }): boolean {
  return artist.demo === true;
}
