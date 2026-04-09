# Unified Onboarding Flow

This directory contains the unified onboarding flow for Jovie. The onboarding process has been simplified to use a single, consistent experience.

## Architecture

- **Entry Point**: `/app/onboarding/page.tsx` - Main onboarding route
- **Component**: `OnboardingFormWrapper` - Lightweight wrapper for onboarding bootstrapping
- **Implementation**: `OnboardingV2Form` - The single live onboarding runtime

## Flow

1. User visits `/onboarding`
2. Auth check redirects unauthenticated users to `/signin?redirect_url=/onboarding`
3. Authenticated users see the unified onboarding form
4. V2 onboarding blocks on Spotify import and first-pass discovery
5. Completion hands off to the dashboard only after onboarding readiness is terminal

## Key Features

- **Single Entry Point**: Only one active onboarding path
- **Clean Architecture**: No feature flags or conditional rendering
- **Auth Integration**: Seamless integration with Clerk authentication
- **Truthful Blocking**: Import and discovery complete before dashboard handoff
