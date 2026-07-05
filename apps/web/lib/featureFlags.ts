export interface ArtistProfileSectionFlags {
  readonly FULL_PAGE: boolean;
  readonly SOCIAL_PROOF: boolean;
  readonly FAQ: boolean;
}

export type ArtistProfileFlagName = keyof ArtistProfileSectionFlags;

export const ARTIST_PROFILE_FLAGS = {
  FULL_PAGE: true,
  SOCIAL_PROOF: true,
  FAQ: true,
} as const satisfies ArtistProfileSectionFlags;
