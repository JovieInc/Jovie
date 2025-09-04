# Legacy Onboarding Components

This directory contains onboarding components that are no longer used in the Jovie application. These components were part of the previous onboarding system before the unification to a single Apple-style design.

## Components

### `components/OnboardingForm.tsx`
The original onboarding form component. This was the base implementation before design iterations.

### `components/MinimalistOnboardingForm.tsx`
A minimalist variant of the onboarding form that was designed for a cleaner, simpler experience.

### `components/ProgressiveOnboardingForm.tsx`
A progressive onboarding form that broke the process into multiple steps with enhanced UX.

### `components/OnboardingForm.stories.tsx`
Storybook stories for the original OnboardingForm component, used for development and testing.

## Why These Are Legacy

These components were replaced by the unified `AppleStyleOnboardingForm` which provides:
- Consistent Apple-inspired design language
- Better user experience
- Simplified maintenance
- Single source of truth for onboarding

## Preservation

These components are preserved here for:
- Historical reference
- Potential future A/B testing
- Code archaeology and learning
- Emergency rollback scenarios (if needed)

## Usage

⚠️ **Do not import or use these components in the main application.** They are kept for reference only.

The active onboarding flow uses `/app/onboarding/page.tsx` with the unified `OnboardingFormWrapper` component.
