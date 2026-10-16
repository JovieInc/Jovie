import { DSP_PROFILE_CATALOG } from './dsp-profile-catalog';
import { SOCIAL_PROFILE_CATALOG } from './social-profile-catalog';

/** One definition per platform, shared across DSP, social, and OAuth surfaces. */
export const ARTIST_PROFILE_CATALOG = {
  amazon_music: DSP_PROFILE_CATALOG.amazon_music,
  apple_music: DSP_PROFILE_CATALOG.apple_music,
  beacons: SOCIAL_PROFILE_CATALOG.beacons,
  deezer: DSP_PROFILE_CATALOG.deezer,
  instagram: SOCIAL_PROFILE_CATALOG.instagram,
  laylo: SOCIAL_PROFILE_CATALOG.laylo,
  linktree: SOCIAL_PROFILE_CATALOG.linktree,
  soundcloud: DSP_PROFILE_CATALOG.soundcloud,
  spotify: DSP_PROFILE_CATALOG.spotify,
  tidal: DSP_PROFILE_CATALOG.tidal,
  tiktok: SOCIAL_PROFILE_CATALOG.tiktok,
  twitter: SOCIAL_PROFILE_CATALOG.twitter,
  youtube: DSP_PROFILE_CATALOG.youtube,
};
