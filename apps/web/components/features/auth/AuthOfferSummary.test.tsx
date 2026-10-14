import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatUsdAmount } from '@/lib/billing/offer-truth';
import { PLAN_PRICES } from '@/lib/config/plan-prices';

const searchParamsState = {
  value: 'plan=pro&interval=month',
  cache: null as { value: string; params: URLSearchParams } | null,
};

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
  afterEach(() => {
    searchParamsState.cache = null;
  });

  it('renders nothing while the offer summary is disabled', () => {
    searchParamsState.value = 'plan=pro&interval=month';
    render(<AuthOfferSummary mode='sign-up' />);

    expect(screen.queryByTestId('auth-offer-summary')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Start your 14-day Artist Presence trial')
    ).not.toBeInTheDocument();
  });

  it('shows a Pro trial summary on sign-up with the published monthly price', () => {
    searchParamsState.value = 'plan=pro&interval=month';
    render(<AuthOfferSummary mode='sign-up' enabled />);

    const summary = screen.getByTestId('auth-offer-summary');
    expect(summary).toHaveAttribute('data-offer-plan', 'pro');
    expect(summary).toHaveAttribute('data-offer-interval', 'month');
    expect(summary).toHaveTextContent(
      'Start your 14-day Artist Presence trial'
    );
    expect(summary).toHaveTextContent('No credit card');
    expect(summary).toHaveTextContent(
      `${formatUsdAmount(PLAN_PRICES.pro.monthly)}/mo`
    );
  });

  it('does not pitch a new trial on sign-in', () => {
    searchParamsState.value = 'plan=pro&interval=month';
    render(<AuthOfferSummary mode='sign-in' enabled />);

    const summary = screen.getByTestId('auth-offer-summary');
    expect(summary).toHaveTextContent('Continue to Artist Presence');
    expect(summary).toHaveTextContent('Existing subscribers go to billing');
    expect(summary).not.toHaveTextContent(
      'Start your 14-day Artist Presence trial'
    );
  });

  it('keeps Max explicit and trial-free', () => {
    searchParamsState.value = 'plan=max&interval=month';
    render(<AuthOfferSummary mode='sign-up' enabled />);

    const summary = screen.getByTestId('auth-offer-summary');
    expect(summary).toHaveAttribute('data-offer-plan', 'max');
    expect(summary).toHaveTextContent('Continue to Max');
    expect(summary).toHaveTextContent('Contact sales');
    expect(summary).toHaveTextContent('No self-service Max checkout');
    expect(summary).not.toHaveTextContent(
      'Start your 14-day Artist Presence trial'
    );
  });
});
