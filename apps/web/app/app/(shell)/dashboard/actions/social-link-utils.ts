export interface SocialLinkExistenceCounts {
  hasLinks?: boolean | number | string | null;
  hasMusicLinks?: boolean | number | string | null;
}

export interface SocialLinkExistenceFlags {
  hasLinks: boolean;
  hasMusicLinks: boolean;
}

export function mapSocialLinkExistence(
  counts: SocialLinkExistenceCounts | null | undefined
): SocialLinkExistenceFlags {
  const parseBoolLike = (value: boolean | number | string | null | undefined) =>
    value === true || value === 1 || value === '1' || value === 't';

  return {
    hasLinks: parseBoolLike(counts?.hasLinks),
    hasMusicLinks: parseBoolLike(counts?.hasMusicLinks),
  };
}
