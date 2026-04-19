import type {
  ClaimableProfileSnapshot,
  PendingClaimContext,
  ProfileVisitorState,
} from './types';

export function supportsDirectProfileClaim(
  profile: Pick<ClaimableProfileSnapshot, 'spotifyId'>
): boolean {
  return typeof profile.spotifyId === 'string' && profile.spotifyId.length > 0;
}

export function getProfileVisitorState({
  profile,
  authUserId,
  pendingClaimContext,
}: {
  profile: ClaimableProfileSnapshot;
  authUserId: string | null;
  pendingClaimContext: PendingClaimContext | null;
}): ProfileVisitorState {
  if (authUserId && profile.userClerkId === authUserId) {
    return 'owner';
  }

  if (profile.isClaimed) {
    return 'claimed_public';
  }

  if (
    pendingClaimContext &&
    (pendingClaimContext.creatorProfileId !== profile.id ||
      pendingClaimContext.username !== profile.username.toLowerCase())
  ) {
    return 'claim_invalid';
  }

  if (pendingClaimContext?.mode === 'token_backed') {
    return 'claim_intent_token';
  }

  if (pendingClaimContext?.mode === 'direct_profile') {
    return 'claim_intent_direct';
  }

  return 'organic_unclaimed';
}
