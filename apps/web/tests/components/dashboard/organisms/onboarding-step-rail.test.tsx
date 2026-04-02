import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getRailStepState,
  ONBOARDING_RAIL_STEPS,
  OnboardingStepRail,
  resolveRailStepId,
} from '@/features/dashboard/organisms/onboarding-v2/OnboardingStepRail';

describe('OnboardingStepRail', () => {
  it('maps late-arrivals onto the releases rail step', () => {
    expect(resolveRailStepId('late-arrivals')).toBe('releases');
    expect(resolveRailStepId('profile-ready')).toBe('profile-ready');
  });

  it('marks earlier steps complete, current step active, and later steps upcoming', () => {
    expect(getRailStepState('handle', 'social')).toBe('complete');
    expect(getRailStepState('social', 'social')).toBe('current');
    expect(getRailStepState('profile-ready', 'social')).toBe('upcoming');
  });

  it('keeps releases active while late arrivals are still resolving', () => {
    expect(getRailStepState('releases', 'late-arrivals')).toBe('current');
    expect(getRailStepState('profile-ready', 'late-arrivals')).toBe('upcoming');
  });

  it('covers the full user-facing onboarding sequence', () => {
    expect(ONBOARDING_RAIL_STEPS.map(step => step.label)).toEqual([
      'Claim Handle',
      'Find Your Spotify',
      'Confirm Artist',
      'Upgrade',
      'Review DSPs',
      'Review Socials',
      'Review Releases',
      'Finish Profile',
    ]);
  });

  it('renders the simplified rail heading and dot markers', () => {
    render(<OnboardingStepRail currentStep='social' />);

    expect(screen.getByText('Jovie set up')).toBeInTheDocument();
    expect(
      screen.getByTestId('onboarding-step-dot-handle')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/set up in a few steps/i)
    ).not.toBeInTheDocument();
  });
});
