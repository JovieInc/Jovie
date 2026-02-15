export interface AppleStyleOnboardingFormProps {
  readonly initialDisplayName?: string;
  readonly initialHandle?: string;
  readonly userEmail?: string | null;
  readonly userId: string;
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
    title: 'Claim your handle',
    prompt: '',
  },
  { id: 'done', title: "You're live.", prompt: '' },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
