export type ClaimEntryMode = 'token_backed' | 'direct_profile';

export interface PendingClaimContext {
  readonly mode: ClaimEntryMode;
  readonly creatorProfileId: string;
  readonly username: string;
  readonly claimTokenHash?: string | null;
  readonly leadId?: string | null;
  readonly expectedSpotifyArtistId?: string | null;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export type ProfileVisitorState =
  | 'owner'
  | 'claim_intent_token'
  | 'claim_intent_direct'
  | 'organic_unclaimed'
  | 'claimed_public'
  | 'claim_invalid';

export interface ClaimableProfileSnapshot {
  readonly id: string;
  readonly username: string;
  readonly isClaimed: boolean | null | undefined;
  readonly userClerkId?: string | null;
  readonly spotifyId?: string | null;
}
