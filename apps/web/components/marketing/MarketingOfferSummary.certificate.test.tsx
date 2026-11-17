import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import {
  formatPublicPriceDisplay,
  getPublicPriceClaim,
} from '@/lib/billing/offer-truth';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingOfferSummary } from './MarketingOfferSummary';
import meta, {
  EmptyInclusions,
  LongContentInclusions,
  PartialNoTerms,
  RtlArabic,
} from './MarketingOfferSummary.states.stories';

// Rendered-state and axe coverage; the offer-truth contract lives in
// MarketingOfferSummary.test.tsx.
function renderState(
  args: Partial<ComponentProps<typeof MarketingOfferSummary>> | undefined
) {
  return render(<MarketingOfferSummary {...meta.args} {...args} />);
}

describe('MarketingOfferSummary states', () => {
  it('renders the default free summary axe-clean', async () => {
    const { container } = renderState({});
    const claim = getPublicPriceClaim('free');
    expect(screen.getByTestId('marketing-offer-summary')).toHaveTextContent(
      formatPublicPriceDisplay(claim)
    );
    expect(screen.getByText(claim.note)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the named list with no rows when nothing is included yet', async () => {
    const { container } = renderState(EmptyInclusions.args);
    const list = screen.getByRole('list', { name: 'Included in Pro' });
    expect(within(list).queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByTestId('marketing-offer-summary')).toHaveAttribute(
      'data-offer-plan',
      'pro'
    );
    await expectNoA11yViolations(container);
  });

  it('drops only the terms note in the partial state', async () => {
    const { container } = renderState(PartialNoTerms.args);
    expect(
      screen.queryByText(getPublicPriceClaim('free').note)
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Included free' })).getAllByRole(
        'listitem'
      )
    ).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('keeps every long inclusion row whole and bound to its entitlement', async () => {
    const { container } = renderState(LongContentInclusions.args);
    const rows = within(
      screen.getByRole('list', {
        name: 'Everything included in the Pro plan for working artists',
      })
    ).getAllByRole('listitem');
    expect(rows.map(row => row.getAttribute('data-entitlement'))).toEqual(
      LongContentInclusions.args?.included?.map(item => item.entitlement)
    );
    await expectNoA11yViolations(container);
  });

  it('renders Arabic inclusions axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingOfferSummary {...meta.args} {...RtlArabic.args} />
      </div>
    );
    expect(screen.getByRole('list', { name: 'مشمول مجانًا' })).toHaveTextContent(
      'روابط ذكية غير محدودة'
    );
    await expectNoA11yViolations(container);
  });
});
