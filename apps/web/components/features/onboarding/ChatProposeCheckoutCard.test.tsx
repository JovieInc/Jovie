import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  formatPublicPriceDisplay,
  getPublicPriceClaim,
} from '@/lib/billing/offer-truth';
import { ChatProposeCheckoutCard } from './ChatProposeCheckoutCard';

function expectedLabel(plan: 'free' | 'pro' | 'max'): string {
  const claim = getPublicPriceClaim(plan);
  return `${claim.displayName} · ${formatPublicPriceDisplay(claim)}`;
}

describe('ChatProposeCheckoutCard', () => {
  it.each(['free', 'pro', 'max'] as const)(
    'quotes the offer-truth price label for plan %s',
    plan => {
      render(
        <ChatProposeCheckoutCard
          payload={{
            action: 'propose_checkout',
            plan,
            handoffUrl: '/onboarding/checkout?plan=pro',
          }}
        />
      );

      expect(screen.getByText('Continue to checkout')).toBeInTheDocument();
      expect(screen.getByText(expectedLabel(plan))).toBeInTheDocument();
    }
  );

  it('shows a generic label when no plan is proposed', () => {
    render(
      <ChatProposeCheckoutCard
        payload={{
          action: 'propose_checkout',
          plan: null,
          handoffUrl: '/onboarding/checkout',
        }}
      />
    );

    expect(screen.getByText('Pick a plan')).toBeInTheDocument();
  });

  it('honours a handoffUrl inside the onboarding checkout route family', () => {
    render(
      <ChatProposeCheckoutCard
        payload={{
          action: 'propose_checkout',
          plan: 'pro',
          handoffUrl: '/onboarding/checkout?plan=pro',
        }}
      />
    );

    expect(screen.getByRole('link', { name: /continue/i })).toHaveAttribute(
      'href',
      '/onboarding/checkout?plan=pro'
    );
  });

  it.each([
    'https://evil.example/onboarding/checkout',
    '/pricing',
    '/onboarding/settings',
  ])('ignores an out-of-family handoffUrl %s', handoffUrl => {
    render(
      <ChatProposeCheckoutCard
        payload={{ action: 'propose_checkout', plan: 'pro', handoffUrl }}
      />
    );

    expect(screen.getByRole('link', { name: /continue/i })).toHaveAttribute(
      'href',
      '/onboarding/checkout'
    );
  });
});
