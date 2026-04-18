const DISPLAY_NAME_MAX_LENGTH = 50;

export const canProceedFromProfileReview = (
  displayName: string,
  avatarUrl: string | null
): boolean => {
  return displayName.trim().length > 0 && Boolean(avatarUrl);
};

/**
 * Validate display name for onboarding profile review.
 * Returns null if valid, or an error message string if invalid.
 */
export const validateDisplayName = (
  name: string,
  handle: string
): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return 'Display name is required';
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH)
    return `Must be ${DISPLAY_NAME_MAX_LENGTH} characters or less`;
  if (trimmed.toLowerCase() === handle.toLowerCase())
    return 'Please use your artist or real name, not your handle';
  return null;
};

/**
 * Verify avatar presence (mirrors server-side verifyProfileHasAvatar logic).
 * Returns the avatarUrl if present and non-empty, otherwise throws.
 */
export const verifyAvatarPresent = (
  profile: { avatarUrl: string | null } | undefined
): { avatarUrl: string } => {
  const avatarUrl = profile?.avatarUrl?.trim();
  if (!avatarUrl) {
    throw new Error('Profile photo is required');
  }
  return { avatarUrl };
};

/**
 * Resolve initial step index for step-resume.
 * Returns profile-review step index if user completed onboarding but lacks a photo.
 */
export const resolveInitialStep = (
  profile: {
    onboardingCompletedAt: Date | null;
    avatarUrl: string | null;
  } | null,
  profileReviewStepIndex: number
): number => {
  const isReturningForPhoto =
    profile?.onboardingCompletedAt && !profile?.avatarUrl;
  return isReturningForPhoto ? profileReviewStepIndex : 0;
};
