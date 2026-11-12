import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  formatPublicPriceDisplay,
  getPublicPriceClaim,
} from '@/lib/billing/offer-truth';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
      '/onboarding/checkout?plan=pro&source=intent'
    );
  });

  // An artist pressing Continue mid-interview, before their page is live, must
  // reach checkout. Without source=intent the checkout page reads the visit as
  // an organic upsell and redirects them back to /start.
  it.each([
    ['/onboarding/checkout', '/onboarding/checkout?source=intent'],
    [
      '/onboarding/checkout?plan=pro',
      '/onboarding/checkout?plan=pro&source=intent',
    ],
    [
      '/onboarding/checkout?plan=pro&source=upsell',
      '/onboarding/checkout?plan=pro&source=intent',
    ],
  ])(
    'marks the handoff %s as artist-initiated checkout',
    (handoffUrl, href) => {
      render(
        <ChatProposeCheckoutCard
          payload={{ action: 'propose_checkout', plan: 'pro', handoffUrl }}
        />
      );

      expect(screen.getByRole('link', { name: /continue/i })).toHaveAttribute(
        'href',
        href
      );
    }
  );

  it.each([
    'https://evil.example/onboarding/checkout',
    '/pricing',
    '/onboarding/settings',
    '/onboarding/checkout-elsewhere',
  ])('ignores an out-of-family handoffUrl %s', handoffUrl => {
    render(
      <ChatProposeCheckoutCard
        payload={{ action: 'propose_checkout', plan: 'pro', handoffUrl }}
      />
    );

    expect(screen.getByRole('link', { name: /continue/i })).toHaveAttribute(
      'href',
      '/onboarding/checkout?source=intent'
    );
  });

  it('paints Continue with the on-media tokens', () => {
    render(
      <ChatProposeCheckoutCard
        payload={{
          action: 'propose_checkout',
          plan: 'pro',
          handoffUrl: '/onboarding/checkout?plan=pro',
        }}
      />
    );

    expect(screen.getByRole('link', { name: 'Continue' })).toHaveClass(
      'bg-on-media',
      'text-ink-on-media',
      'dark:text-on-media'
    );
  });

  it.each([
    ['a proposed plan', 'max', '/onboarding/checkout?plan=max'],
    ['no plan', null, ''],
  ] as const)(
    'has no accessibility violations with %s',
    async (_name, plan, handoffUrl) => {
      const { container } = render(
        <div dir='rtl' lang='ar'>
          <ChatProposeCheckoutCard
            payload={{ action: 'propose_checkout', plan, handoffUrl }}
          />
        </div>
      );
      await expectNoA11yViolations(container);
    }
  );
});
