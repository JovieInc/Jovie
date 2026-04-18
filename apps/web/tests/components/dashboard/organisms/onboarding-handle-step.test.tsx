import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingHandleStep } from '@/features/dashboard/organisms/onboarding/OnboardingHandleStep';

describe('OnboardingHandleStep', () => {
  const baseProps = {
    title: 'Claim your link',
    prompt:
      'This is the only link you need to share your music. Make it yours.',
    handleInput: 'artistname',
    isHydrated: true,
    handleValidation: {
      available: true,
      checking: false,
      error: null,
      clientValid: true,
      suggestions: [],
    },
    stateError: null,
    isSubmitting: false,
    isTransitioning: false,
    ctaDisabledReason: null,
    inputRef: { current: null },
    onHandleChange: vi.fn(),
    onSubmit: vi.fn(),
  };

  it('renders the handle input with jov.ie/ prefix', () => {
    render(<OnboardingHandleStep {...baseProps} />);

    expect(screen.getByText('jov.ie/')).toBeInTheDocument();
    expect(screen.getByLabelText('Claim your handle')).toBeInTheDocument();
  });

  it('keeps the standard layout for non-reserved handles', () => {
    render(<OnboardingHandleStep {...baseProps} isReservedHandle={false} />);

    expect(
      screen.queryByText(/We reserved this for you/)
    ).not.toBeInTheDocument();
  });

  it('keeps the form non-interactive until hydration completes', () => {
    render(<OnboardingHandleStep {...baseProps} isHydrated={false} />);

    expect(screen.getByLabelText('Claim your handle')).toBeDisabled();
  });
});
