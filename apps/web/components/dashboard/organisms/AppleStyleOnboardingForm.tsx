'use client';

/**
 * AppleStyleOnboardingForm Component
 *
 * @deprecated This file is maintained for backwards compatibility.
 * Import from '@/components/dashboard/organisms/apple-style-onboarding' for new code.
 */

export type { AppleStyleOnboardingFormProps } from './apple-style-onboarding';
// Re-export utilities for backwards compatibility
export {
  AppleStyleOnboardingForm,
  ONBOARDING_STEPS,
  useHandleValidation,
  useOnboardingSubmit,
  useStepNavigation,
} from './apple-style-onboarding';

// Keep types exported for backwards compatibility
export type {
  HandleValidationState,
  OnboardingState,
} from './apple-style-onboarding/types';
