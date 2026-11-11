import type { StartEntryProfile } from '@/lib/onboarding/start-entry-profile';
import {
  EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
  type OnboardingProfileBuilderState,
} from './onboardingProfileRailState';

/** Preview state for a prebuilt, unclaimed page so the rail shows it on first paint. */
export function buildEntryProfileBuilderState(
  entryProfile: StartEntryProfile | null | undefined
): OnboardingProfileBuilderState {
  // An open name still seeds the draft panel (Pen R6As7U): the visitor sees
  // jov.ie/<handle> taking shape before the first message.
  if (entryProfile?.status === 'available') {
    return {
      ...EMPTY_ONBOARDING_PROFILE_BUILDER_STATE,
      handle: entryProfile.handle,
    };
  }
  if (entryProfile?.status !== 'claimable') {
    return EMPTY_ONBOARDING_PROFILE_BUILDER_STATE;
  }
  return {
    artist: {
      id: entryProfile.spotifyId ?? `handle-${entryProfile.handle}`,
      name: entryProfile.displayName,
      url: entryProfile.spotifyUrl ?? '',
      imageUrl: entryProfile.avatarUrl,
      genres: entryProfile.genres,
    },
    artistConfirmed: false,
    handle: entryProfile.handle,
    socialLinks: entryProfile.socialLinks,
  };
}
