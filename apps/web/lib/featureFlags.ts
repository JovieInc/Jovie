export interface ArtistProfileSectionFlags {
  readonly FULL_PAGE: boolean;
  readonly SOCIAL_PROOF: boolean;
  readonly FAQ: boolean;
}

export type ArtistProfileFlagName = keyof ArtistProfileSectionFlags;

const IS_VERCEL_PRODUCTION = process.env.VERCEL_ENV === 'production';

export const ARTIST_PROFILE_FLAGS = {
  FULL_PAGE: !IS_VERCEL_PRODUCTION,
  SOCIAL_PROOF: !IS_VERCEL_PRODUCTION,
  FAQ: !IS_VERCEL_PRODUCTION,
} as const satisfies ArtistProfileSectionFlags;
