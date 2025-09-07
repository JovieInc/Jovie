# Unified Onboarding Flow

This directory contains the unified onboarding flow for Jovie. The onboarding process has been simplified to use a single, consistent experience.

## Architecture

- **Entry Point**: `/app/onboarding/page.tsx` - Main onboarding route
- **Component**: `OnboardingFormWrapper` - Simplified wrapper that renders the Apple-style onboarding form
- **Implementation**: `AppleStyleOnboardingForm` - The actual onboarding form component

## Flow

1. User visits `/onboarding`
2. Auth check redirects unauthenticated users to `/signin?redirect_url=/onboarding`
3. Authenticated users see the unified onboarding form
4. Form handles handle selection and profile creation
5. Completion redirects to dashboard

## Key Features

- **Single Entry Point**: Only one active onboarding path
- **Clean Architecture**: No feature flags or conditional rendering
- **Auth Integration**: Seamless integration with Clerk authentication
- **Theme Support**: Includes theme toggle for user preference

## Legacy Components

Legacy onboarding components have been moved to `/app/legacy/onboarding/components/`:
- `OnboardingForm.tsx` (original form)
- `MinimalistOnboardingForm.tsx` (minimalist variant)
- `ProgressiveOnboardingForm.tsx` (progressive variant)
- `OnboardingForm.stories.tsx` (Storybook stories)

These components are no longer used in the application but are preserved for reference.

## Copy Reference

Current step copy for `AppleStyleOnboardingForm`:

1. **welcome** – Title: "Launch your profile in moments." Prompt: "Three quick steps and you're live."
2. **name** – Title: "Your name, your signature." Prompt: "Displayed on your Jovie profile."
3. **handle** – Title: "Claim your @handle." Prompt: "This becomes your unique link."
4. **done** – Title: "You're live." Prompt: "Your link is ready to share."
