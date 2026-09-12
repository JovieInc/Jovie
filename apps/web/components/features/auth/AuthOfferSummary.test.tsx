import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const searchParamsState = {
  value: 'plan=pro&interval=year',
  cache: null as { value: string; params: URLSearchParams } | null,
};

// next/navigation's useSearchParams is referentially stable per URL; returning
// a new URLSearchParams each call re-triggers the component's effect forever.
vi.mock('next/navigation', () => ({
  useSearchParams: () => {
    if (
      !searchParamsState.cache ||
      searchParamsState.cache.value !== searchParamsState.value
    ) {
      searchParamsState.cache = {
        value: searchParamsState.value,
        params: new URLSearchParams(searchParamsState.value),
      };
    }
    return searchParamsState.cache.params;
  },
}));

import { AuthOfferSummary } from './AuthOfferSummary';

describe('AuthOfferSummary', () => {
  it('shows a Pro trial summary on sign-up with the selected interval', () => {
    searchParamsState.value = 'plan=pro&interval=year';
    render(<AuthOfferSummary mode='sign-up' />);

    const summary = screen.getByTestId('auth-offer-summary');
    expect(summary).toHaveAttribute('data-offer-plan', 'pro');
    expect(summary).toHaveAttribute('data-offer-interval', 'year');
    expect(summary).toHaveTextContent('Start your 14-day Pro trial');
    expect(summary).toHaveTextContent('No credit card');
  });

  it('does not pitch a new trial on sign-in', () => {
    searchParamsState.value = 'plan=pro&interval=month';
    render(<AuthOfferSummary mode='sign-in' />);

    const summary = screen.getByTestId('auth-offer-summary');
    expect(summary).toHaveTextContent('Continue to Pro');
    expect(summary).toHaveTextContent('Existing subscribers go to billing');
    expect(summary).not.toHaveTextContent('Start your 14-day Pro trial');
  });

  it('keeps Max explicit and trial-free', () => {
    searchParamsState.value = 'plan=max&interval=month';
    render(<AuthOfferSummary mode='sign-up' />);

    const summary = screen.getByTestId('auth-offer-summary');
    expect(summary).toHaveAttribute('data-offer-plan', 'max');
    expect(summary).toHaveTextContent('Continue to Max');
    expect(summary).toHaveTextContent('Contact sales');
    expect(summary).toHaveTextContent('No self-service Max checkout');
  });
});
