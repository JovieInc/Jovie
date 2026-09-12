import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const searchParamsState = { value: 'plan=pro&interval=year' };

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsState.value),
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
    expect(summary).toHaveTextContent('$375/yr');
    expect(summary).toHaveTextContent('$31.25/mo');
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
    expect(summary).toHaveTextContent('$149/mo');
    expect(summary).toHaveTextContent('No Max trial');
  });
});
