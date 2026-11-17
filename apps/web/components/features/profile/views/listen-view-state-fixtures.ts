import { type AvailableDSP, getAvailableDSPs } from '@/lib/dsp';
import { PROFILE_STORY_ARTIST } from '../profile-story-fixture';

/** DSP rows built the way the profile builds them, shared by stories and tests. */
export const LISTEN_VIEW_DSPS: AvailableDSP[] = getAvailableDSPs({
  ...PROFILE_STORY_ARTIST,
  spotify_id: '4u',
  apple_music_url: 'https://music.apple.com/us/artist/tim-white/1',
});

/** Every service the profile can list, for the many-rows state. */
export const LISTEN_VIEW_MANY_DSPS: AvailableDSP[] = getAvailableDSPs({
  ...PROFILE_STORY_ARTIST,
  spotify_id: '4u',
  apple_music_url: 'https://music.apple.com/us/artist/tim-white/1',
  youtube_url: 'https://www.youtube.com/@timwhite',
  soundcloud_id: 'timwhite',
  deezer_id: '1',
  tidal_id: '1',
  youtube_music_id: 'UC1',
});
