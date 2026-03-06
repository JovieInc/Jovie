export interface AppleStyleOnboardingFormProps {
  readonly initialDisplayName?: string;
  readonly initialHandle?: string;
  readonly isReservedHandle?: boolean;
  readonly userEmail?: string | null;
  readonly userId: string;
  readonly shouldAutoSubmitHandle?: boolean;
}

export interface OnboardingState {
  step:
    | 'validating'
    | 'creating-user'
    | 'checking-handle'
    | 'creating-artist'
    | 'complete';
  progress: number;
  error: string | null;
  retryCount: number;
  isSubmitting: boolean;
}

export interface HandleValidationState {
  available: boolean;
  checking: boolean;
  error: string | null;
  clientValid: boolean;
  suggestions: string[];
}

export const ONBOARDING_STEPS = [
  {
    id: 'handle',
    title: 'Choose your handle',
    prompt: 'This is how fans will find you.',
  },
  {
    id: 'dsp',
    title: 'Connect your music',
    prompt: 'Import your releases from Spotify so fans can find your music.',
  },
  {
    id: 'profile-review',
    title: 'Your profile',
    prompt: 'Review your profile before going live.',
  },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
