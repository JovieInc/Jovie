import type { OnboardingProfileBuilderState } from './onboardingProfileRailState';

/**
 * Presentation-only /start journey steps (JOV-14243).
 * Mapped from existing profile-builder receipts. Does not change JOV-8051
 * interview order or adaptive question logic.
 */

/** Chat state wins once it knows anything; otherwise keep the entry preview. */
export function resolveOnboardingJourneyState(
  profileBuilderState: OnboardingProfileBuilderState,
  entryBuilderState: OnboardingProfileBuilderState
): OnboardingProfileBuilderState {
  const hasChatBuilderProgress =
    profileBuilderState.artist !== null ||
    profileBuilderState.artistConfirmed ||
    profileBuilderState.handle !== null ||
    profileBuilderState.handleConfirmed ||
    profileBuilderState.profileDraft != null;
  return hasChatBuilderProgress ? profileBuilderState : entryBuilderState;
}
export const ONBOARDING_START_STEPS = [
  {
    id: 'find',
    label: 'Find You',
    hint: 'Your name or a link so we can pull your work in.',
  },
  {
    id: 'claim',
    label: 'Claim Your Name',
    hint: 'The handle people type to reach you.',
  },
  {
    id: 'live',
    label: 'Go Live',
    hint: 'Your profile, ready to share.',
  },
] as const;

export type OnboardingStartStepId =
  (typeof ONBOARDING_START_STEPS)[number]['id'];

export function hasOnboardingIdentity(
  state: OnboardingProfileBuilderState
): boolean {
  if (state.artistConfirmed || state.artist) return true;
  const draft = state.profileDraft;
  return Boolean(
    draft?.activeRole &&
      draft.activeRole !== 'artist' &&
      draft.selectedSource?.url
  );
}

/**
 * Derive the quiet step index from builder state already owned by the chat.
 * Find You → Claim Your Name → Go Live.
 */
export function resolveOnboardingStartStepIndex(
  state: OnboardingProfileBuilderState
): number {
  if (state.handleConfirmed || state.profileDraft?.awaiting === 'review') {
    return 2;
  }
  if (hasOnboardingIdentity(state) || state.handle) {
    return 1;
  }
  return 0;
}
