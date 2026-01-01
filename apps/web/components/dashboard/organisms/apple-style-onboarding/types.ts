export interface AppleStyleOnboardingFormProps {
  initialDisplayName?: string;
  initialHandle?: string;
  userEmail?: string | null;
  userId: string;
  skipNameStep?: boolean;
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
    id: 'name',
    title: 'What should we call you?',
    prompt: '',
  },
  {
    id: 'handle',
    title: 'Claim your handle',
    prompt: '',
  },
  { id: 'done', title: "You're live.", prompt: '' },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
