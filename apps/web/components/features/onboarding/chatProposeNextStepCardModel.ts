import type { AudienceBand } from '@/lib/chat/tools/onboarding-signals';
import {
  isAllowedEnrichmentSocialUrl,
  readPostKeepEnrichmentNotes,
} from '@/lib/onboarding/post-keep-enrichment-notes';
import type { ClaimStatus } from './useOnboardingClaim';

export type EnrichmentPanel = 'social' | 'audience' | null;
export type SocialPlatformNote = 'instagram' | 'tiktok';

export const AUDIENCE_BAND_OPTIONS: ReadonlyArray<{
  readonly band: AudienceBand;
  readonly caption: string;
}> = [
  { band: 'under_500', caption: 'Under 500' },
  { band: '500_to_5k', caption: '500 To 5k' },
  { band: '5k_to_50k', caption: '5k To 50k' },
  { band: '50k_to_500k', caption: '50k To 500k' },
  { band: 'over_500k', caption: '500k+' },
];

/**
 * Hydrate chip UI from sessionStorage notes (ONB-34). Claim already reads
 * the same key; without this, remount / interruption return shows empty
 * “Add …” chips while notes still carry — dishonest vs what claim sends.
 */
export function initialEnrichmentChipState(): {
  readonly platform: SocialPlatformNote | null;
  readonly audienceBand: AudienceBand | null;
  readonly socialUrl: string | null;
  readonly urlDraft: string;
} {
  const notes = readPostKeepEnrichmentNotes();
  if (!notes) {
    return {
      platform: null,
      audienceBand: null,
      socialUrl: null,
      urlDraft: '',
    };
  }
  const platform = notes.platform ?? null;
  const rawUrl = notes.socialUrl?.trim() || null;
  const socialUrl =
    rawUrl && isAllowedEnrichmentSocialUrl(rawUrl, platform) ? rawUrl : null;
  return {
    platform,
    audienceBand: (notes.audienceBand ?? null) as AudienceBand | null,
    socialUrl,
    urlDraft: socialUrl ?? '',
  };
}

/** ONB-36/38/40: signed-in Keep copy must track claim handoff, not forever-promise. */
export function signedInHandoffCopy(
  kind: 'waitlist' | 'instant_access',
  status: ClaimStatus
): string {
  if (status === 'error') {
    return "We couldn't save your request. Refresh this page to try again.";
  }
  if (status === 'identity-conflict') {
    return 'This profile belongs to another account. Switch accounts to continue, or start over.';
  }
  // ONB-40: missing durable artist identity — name identity recovery.
  if (status === 'intake-required') {
    return 'Name your artist or paste a Spotify link so we can finish saving your request. Nothing more is happening until you continue.';
  }
  // ONB-38: claim settled with nothing in flight — name the next action.
  if (status === 'no-op') {
    return 'Reply below so we can finish saving your request. Nothing more is happening until you continue.';
  }
  if (kind === 'waitlist') {
    return 'Saving your request and reserving your name and profile now. Keep this page open until the receipt appears.';
  }
  return "You're already signed in. Linking this conversation to your account.";
}

/** Alert when claim handoff is terminal (ONB-36). */
export function isTerminalClaimHandoff(status: ClaimStatus): boolean {
  return status === 'error' || status === 'identity-conflict';
}
