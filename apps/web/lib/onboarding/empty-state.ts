import type { ChatSuggestion } from '@/components/jovie/types';

export const ONBOARDING_ENTRY_TITLE = 'What Are You Working On?';
export const ONBOARDING_ENTRY_SUPPORT =
  'Start with your artist name, Spotify link, or next release.';

/** Starter pills for the anonymous /start empty state. */
export const ONBOARDING_STARTER_SUGGESTIONS: readonly ChatSuggestion[] = [
  {
    icon: 'Music',
    label: 'Find My Spotify Artist',
    prompt: "I'm an artist — help me find my Spotify profile.",
    accent: 'blue',
  },
  {
    icon: 'Disc3',
    label: 'Plan A Release',
    prompt: 'Help me plan my next release.',
    accent: 'green',
  },
  {
    icon: 'Eye',
    label: 'Build Artist Profile',
    prompt: 'Help me build my artist profile.',
    accent: 'purple',
  },
  {
    icon: 'Link2',
    label: 'Set Up My Link Page',
    prompt: 'Help me set up my artist link page.',
    accent: 'blue',
  },
] as const;
