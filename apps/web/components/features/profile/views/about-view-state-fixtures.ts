import type { Artist } from '@/types/db';
import { PROFILE_STORY_ARTIST } from '../profile-story-fixture';

/** An artist with no bio, location, hometown or active-since year. */
export const ABOUT_EMPTY_ARTIST: Artist = {
  ...PROFILE_STORY_ARTIST,
  tagline: undefined,
  location: null,
  hometown: null,
  active_since_year: null,
};

/** An artist whose bio and place names run long. */
export const ABOUT_LONG_ARTIST: Artist = {
  ...PROFILE_STORY_ARTIST,
  name: 'Tim White and the Midnight Orchestra of Los Angeles',
  tagline:
    'Producer, songwriter and after-hours romantic who has spent more than a decade building records in borrowed studios, late-night rehearsal rooms and the back rows of tour buses, writing for other artists by day and for himself long after everyone else has gone home.',
  location: 'Los Angeles, California, United States of America',
  hometown: 'Royal Leamington Spa, Warwickshire, England',
  active_since_year: 2012,
};

export const ABOUT_LONG_GENRES = [
  'Progressive house',
  'Melodic techno',
  'Alternative electronic pop',
  'Downtempo and ambient',
  'Indie dance',
];

/** The story artist with Arabic copy for right-to-left stories. */
export const ABOUT_RTL_ARTIST: Artist = {
  ...PROFILE_STORY_ARTIST,
  tagline: 'منتج وكاتب أغانٍ من لوس أنجلوس.',
  location: 'لوس أنجلوس',
};
