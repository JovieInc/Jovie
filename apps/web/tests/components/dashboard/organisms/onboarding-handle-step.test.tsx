import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingHandleStep } from '@/components/dashboard/organisms/onboarding/OnboardingHandleStep';

describe('OnboardingHandleStep', () => {
  const baseProps = {
    title: 'Claim your handle',
    prompt: 'This is how fans will find you.',
    handleInput: 'artistname',
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

  it('elevates reserved handles with a primary identity headline', () => {
    render(<OnboardingHandleStep {...baseProps} isReservedHandle />);

    expect(screen.getByText('Reserved handle')).toBeInTheDocument();
    expect(screen.getByText("You're @artistname")).toBeInTheDocument();
    expect(screen.getByText('Edit handle (optional)')).toBeInTheDocument();
  });

  it('keeps the standard layout for non-reserved handles', () => {
    render(<OnboardingHandleStep {...baseProps} isReservedHandle={false} />);

    expect(screen.queryByText('Reserved handle')).not.toBeInTheDocument();
    expect(screen.queryByText("You're @artistname")).not.toBeInTheDocument();
    expect(
      screen.queryByText('Edit handle (optional)')
    ).not.toBeInTheDocument();
  });
});
