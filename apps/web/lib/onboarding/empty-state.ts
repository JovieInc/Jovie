import type { ChatSuggestion } from '@/components/jovie/types';

/**
 * Static opener shown before the visitor sends their first message.
 * Mirrors the canonical onboarding system-prompt opener so the UI and
 * model stay aligned on memory disclosure + one intake question.
 */
export const ONBOARDING_WELCOME_MESSAGE =
  "Hey — I'm Jovie. Early access is limited right now, so some artists land on the waitlist. I'll remember this chat so we can pick up where we left off if you sign up. What are you working on?";

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
