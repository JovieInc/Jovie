export const canProceedFromProfileReview = (
  displayName: string,
  avatarUrl: string | null
): boolean => {
  return displayName.trim().length > 0 && Boolean(avatarUrl);
};
