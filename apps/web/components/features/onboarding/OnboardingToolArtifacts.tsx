'use client';
// @coverage-via apps/web/tests/unit/onboarding/OnboardingToolArtifacts.test.tsx

import { AlertCircle, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import {
  formatCompactCount,
  formatExactCount,
  formatGenreLabel,
  getSafeSpotifyArtistUrl,
  hostnameFor,
} from '@/lib/onboarding/tool-artifact-format';
import { OnboardingSpotifyArtistPickerCard } from './OnboardingSpotifyArtistPickerCard';
import {
  OnboardingHandleCheckCard,
  OnboardingSocialLinkCard,
  StatusShell,
} from './OnboardingToolStatusCards';
import {
  type ArtistConfirmedOutput,
  isFailed,
  isRunning,
  type OnboardingArtistSelection,
  type ToolArtifactProps,
} from './onboardingToolArtifactTypes';

export type {
  ArtistConfirmedOutput,
  ArtistPickerOutput,
  HandleCheckOutput,
  OnboardingArtistSelection,
  OnboardingDspMatch,
  SocialLinkOutput,
} from './onboardingToolArtifactTypes';

export {
  formatCompactCount,
  formatExactCount,
  formatGenreLabel,
  getSafeSpotifyArtistUrl,
  hostnameFor,
  OnboardingHandleCheckCard,
  OnboardingSocialLinkCard,
  OnboardingSpotifyArtistPickerCard,
};

export function OnboardingArtistConfirmedCard({
  state,
  output,
}: ToolArtifactProps & {
  readonly output?: ArtistConfirmedOutput | null;
}) {
  if (isFailed(state)) {
    return (
      <StatusShell
        icon={<AlertCircle className='h-3.5 w-3.5' />}
        title='Artist profile could not be loaded'
        body='Send the Spotify artist URL and I will keep going from there.'
        tone='error'
      />
    );
  }

  if (isRunning(state) && !output?.artist) {
    return (
      <StatusShell
        icon={
          <Loader2 className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none' />
        }
        title='Pulling the Spotify profile'
        body='I am checking the profile data before making the next call.'
      />
    );
  }

  return null;
}

/**
 * Compact confirmation text for an artist pick.
 * Prefer a short system-style label over a fake conversational user bubble.
 * Spotify id travels in message metadata; this string is display-only.
 */
export function useArtistSelectionMessage() {
  return useMemo(
    () => (artist: OnboardingArtistSelection) => `Selected: ${artist.name}`,
    []
  );
}
