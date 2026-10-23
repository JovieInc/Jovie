import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  formatPublicPriceDisplay,
  getPublicPriceClaim,
} from '@/lib/billing/offer-truth';
import { MarketingOfferSummary } from './MarketingOfferSummary';

const INCLUDED = [
  { label: 'Unlimited smart links', entitlement: 'Unlimited smart links' },
  {
    label: 'Tour dates from Bandsintown',
    entitlement: 'Tour dates (Bandsintown)',
  },
] as const;

describe('MarketingOfferSummary', () => {
  it.each(['free', 'pro', 'enterprise'] as const)(
    'renders the %s price, badge, and terms from offer truth',
    plan => {
      render(
        <MarketingOfferSummary
          plan={plan}
          includedLabel='Included'
          included={INCLUDED}
        />
      );
      const claim = getPublicPriceClaim(plan);
      const summary = screen.getByTestId('marketing-offer-summary');
      expect(summary).toHaveAttribute('data-offer-plan', plan);
      expect(summary).toHaveTextContent(formatPublicPriceDisplay(claim));
      expect(summary).toHaveTextContent(claim.badge);
      expect(summary).toHaveTextContent(claim.note);
    }
  );

  it('names the inclusions list and binds each row to its entitlement', () => {
    render(
      <MarketingOfferSummary
        plan='free'
        includedLabel='Included free'
        included={INCLUDED}
      />
    );
    const list = screen.getByRole('list', { name: 'Included free' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map(row => row.textContent)).toEqual(
      INCLUDED.map(item => item.label)
    );
    expect(rows.map(row => row.getAttribute('data-entitlement'))).toEqual(
      INCLUDED.map(item => item.entitlement)
    );
  });

  it('hides the terms note only when the page links to pricing instead', () => {
    render(
      <MarketingOfferSummary
        plan='free'
        includedLabel='Included free'
        included={INCLUDED}
        showTerms={false}
      />
    );
    expect(
      screen.queryByText(getPublicPriceClaim('free').note)
    ).not.toBeInTheDocument();
  });
});
