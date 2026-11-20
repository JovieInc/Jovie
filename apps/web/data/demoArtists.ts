/**
 * The homepage example slot for marketing surfaces.
 *
 * The fallback for the featured slot: when no opted-in artist is certified
 * (`data/featuredArtists.ts`), the slot shows "Example artist" (handle
 * `example`). It is not a named person and it does not show a verified badge.
 * Tim (2026-11-12) is featured himself for now, so this is the fallback.
 *
 * Rules for every entry here:
 * - `demo: true`. Nothing in this file is a real person, artist, label or
 *   release. Swap a slot to a real artist only through an opt-in record.
 * - The visible name is "Example artist". A personal name reads as a customer.
 * - The image folder slug stays `ivo-lindqvist` so the rendered stills do not
 *   move. Imagery is procedural night stills from
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
  name: 'Example artist',
  handle: 'example',
  profileDisplay: 'jov.ie/example',
  avatarSrc: `${IVO}/avatar.webp`,
  releases: [
    {
      title: 'Slow Weather',
      byline: 'Example artist',
      year: '2026',
      src: `${IVO}/slow-weather.webp`,
    },
    {
      title: 'Night Ferry',
      byline: 'Example artist',
      year: '2025',
      src: `${IVO}/night-ferry.webp`,
    },
    {
      title: 'Glass Coast',
      byline: 'Example artist',
      year: '2025',
      src: `${IVO}/glass-coast.webp`,
    },
    {
      title: 'Paper Satellites',
      byline: 'Example artist',
      year: '2024',
      src: `${IVO}/paper-satellites.webp`,
    },
    {
      title: 'Low Sun',
      byline: 'Example artist',
      year: '2024',
      src: `${IVO}/low-sun.webp`,
    },
    {
      title: 'First Frost',
      byline: 'Example artist',
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
 * artist. Today that is Tim White with his own catalog (Tim, 2026-11-12).
 */
export const HOMEPAGE_FEATURED_ARTIST: FeaturedArtistProfile =
  selectFeaturedArtist(FEATURED_ARTIST_OPT_INS, DEMO_ARTIST_IVO_LINDQVIST);

/** True when a featured slot still shows an invented artist. */
export function isDemoArtist(artist: { readonly demo?: boolean }): boolean {
  return artist.demo === true;
}

/**
 * Whose the mockups are, for labels: "Tim White’s" for a real artist, "an
 * example artist’s" for a demo, so a label never names an invented person.
 */
export function featuredArtistPossessive(artist: {
  readonly demo?: boolean;
  readonly name: string;
}): string {
  return isDemoArtist(artist) ? 'an example artist’s' : `${artist.name}’s`;
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** `featuredArtistPossessive` at the start of a sentence. */
export function featuredArtistPossessiveTitle(artist: {
  readonly demo?: boolean;
  readonly name: string;
}): string {
  return capitalize(featuredArtistPossessive(artist));
}
