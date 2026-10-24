import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OnboardingClaimHandoffCard } from './OnboardingClaimHandoffCard';

describe('OnboardingClaimHandoffCard', () => {
  it('links to checkout for an admitted claim (JOV-8068)', () => {
    render(<OnboardingClaimHandoffCard handoff={{ kind: 'checkout' }} />);

    expect(screen.getByText('Continue to checkout')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue/i })).toHaveAttribute(
      'href',
      '/onboarding/checkout'
    );
    expect(screen.getByTestId('onboarding-claim-handoff')).toHaveAttribute(
      'data-handoff-kind',
      'checkout'
    );
  });

  it('links to the waitlist receipt for a waitlisted claim (JOV-8068)', () => {
    render(<OnboardingClaimHandoffCard handoff={{ kind: 'waitlist' }} />);

    expect(screen.getByText('View your waitlist status')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /continue/i })).toHaveAttribute(
      'href',
      '/waitlist'
    );
    expect(screen.getByTestId('onboarding-claim-handoff')).toHaveAttribute(
      'data-handoff-kind',
      'waitlist'
    );
  });
});
