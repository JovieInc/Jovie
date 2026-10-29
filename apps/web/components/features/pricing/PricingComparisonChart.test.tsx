import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import { getPaidPlanAdditionNames } from '@/lib/billing/public-pricing-features';
import {
  getPublicPricingComparison,
  isPublicPricingFeature,
} from '@/lib/billing/public-pricing-comparison';
import { PRICING_COMPARISON } from '@/lib/entitlements/registry';
import { PricingComparisonChart } from './PricingComparisonChart';

const COMPARISON = getPublicPricingComparison();
const PUBLIC_ROWS = COMPARISON.flatMap(category => category.features);

describe('PricingComparisonChart', () => {
  it('renders every public registry row on desktop, by registry category', () => {
    render(<PricingComparisonChart categories={COMPARISON} />);
    const desktopTable = screen.getByRole('table', {
      name: 'Feature comparison by plan',
    });

    // Only certified rows are public (claims stay literally true).
    expect(PUBLIC_ROWS.length).toBeGreaterThan(0);
    expect(within(desktopTable).getAllByRole('rowheader')).toHaveLength(
      PUBLIC_ROWS.length
    );
    for (const feature of PUBLIC_ROWS) {
      expect(
        within(desktopTable).getByRole('rowheader', { name: feature.name })
      ).toBeInTheDocument();
    }
    for (const category of COMPARISON) {
      expect(
        within(desktopTable).getByText(category.category)
      ).toBeInTheDocument();
    }
  });

  it('keeps roadmap, Max-only and unproven registry rows off public pricing', () => {
    const { container } = render(
      <PricingComparisonChart categories={COMPARISON} />
    );
    const hidden = PRICING_COMPARISON.flatMap(
      category => category.features
    ).filter(feature => !isPublicPricingFeature(feature));

    expect(hidden.length).toBeGreaterThan(0);
    for (const feature of hidden) {
      expect(screen.queryAllByText(feature.name)).toHaveLength(0);
    }
    expect(container.textContent).not.toMatch(/\bsoon\b/i);
    expect(container.textContent).not.toMatch(/\bfans?\b/i);
  });

  it('names the profile feature as a Jovie profile, not an artist profile', () => {
    const { container } = render(
      <PricingComparisonChart categories={COMPARISON} />
    );

    expect(
      screen.getAllByText('Public Jovie profile page').length
    ).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/artist profile/i);
  });

  it('renders named comparison tables from monthly-only public offer truth', () => {
    const { container } = render(
      <PricingComparisonChart categories={COMPARISON} />
    );

    const desktopTable = screen.getByRole('table', {
      name: 'Feature comparison by plan',
    });
    const mobileTable = screen.getByRole('table', {
      name: 'Feature comparison for selected plan',
    });

    for (const table of [desktopTable, mobileTable]) {
      expect(
        within(table).getByRole('columnheader', { name: 'Feature' })
      ).toHaveAttribute('scope', 'col');
      for (const header of table.querySelectorAll('thead th')) {
        expect(header).toHaveAccessibleName();
        expect(header).toHaveClass('whitespace-nowrap');
        expect(header).not.toHaveAttribute('data-wrap', 'feature-label');
      }
    }

    const feature = within(mobileTable).getByRole('rowheader', {
<<<<<<< HEAD
      name: 'Audience email capture',
=======
      name: PUBLIC_ROWS.find(row => row.pro !== false)?.name ?? '',
>>>>>>> 0029062d6e (chore(marketing): refresh baselines and pricing test after rebase onto main)
    });
    expect(feature).toHaveAttribute('scope', 'row');
    expect(feature).toHaveAttribute('data-wrap', 'feature-label');
    expect(feature.className).not.toMatch(
      /line-clamp|truncate|whitespace-nowrap/
    );

    expect(within(desktopTable).getByText('Free')).toBeInTheDocument();
    expect(
      within(desktopTable).getByText('Artist Presence')
    ).toBeInTheDocument();
    expect(
      within(mobileTable).getByText('Artist Presence')
    ).toBeInTheDocument();
    const included = (plan: 'free' | 'pro') =>
      PUBLIC_ROWS.filter(feature => feature[plan] === true).length;
    expect(within(desktopTable).getAllByText('Included')).toHaveLength(
      included('free') + included('pro')
    );
    expect(within(mobileTable).getAllByText('Included')).toHaveLength(
      included('pro')
    );
    expect(desktopTable.querySelector('svg')).toBeNull();
    expect(mobileTable.querySelector('svg')).toBeNull();
    expect(
      screen.getByText('All limits subject to fair-use guardrails.')
    ).toBeInTheDocument();

    expect(
      screen.queryByRole('switch', { name: 'Toggle Annual Billing' })
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Save ~20%')).not.toBeInTheDocument();
    expect(within(desktopTable).getByText('$12')).toBeInTheDocument();
    expect(within(desktopTable).getByText('/mo')).toBeInTheDocument();
    expect(screen.queryByText('Max')).not.toBeInTheDocument();
    expect(screen.queryByText('$149')).not.toBeInTheDocument();
    expect(
      container.querySelector(
        `[data-offer-contract="${ARTIST_VISIBILITY_OFFER_CONTRACT_ID}"]`
      )
    ).not.toBeNull();
    expect(screen.queryByText('Automated follow-ups')).not.toBeInTheDocument();

    const selector = screen.getByRole('combobox', {
      name: 'Select Plan To Compare',
    });
    fireEvent.change(selector, { target: { value: 'free' } });
    expect(selector).toHaveValue('free');
    expect(within(mobileTable).getByText('Free')).toBeInTheDocument();
    expect(within(mobileTable).getByText('$0')).toBeInTheDocument();
    expect(
      within(mobileTable).getAllByText('Unlimited').length
    ).toBeGreaterThan(0);
    expect(within(mobileTable).queryByText('/mo')).not.toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'unknown-plan' } });
    expect(selector).toHaveValue('free');
    expect(within(mobileTable).getByText('$0')).toBeInTheDocument();

    fireEvent.change(selector, { target: { value: 'pro' } });
    expect(selector).toHaveValue('pro');
    expect(
      within(mobileTable).getByText('Artist Presence')
    ).toBeInTheDocument();
    expect(within(mobileTable).getByText('$12')).toBeInTheDocument();
    expect(within(mobileTable).getByText('/mo')).toBeInTheDocument();
    expect(
      within(mobileTable).getAllByText('Unlimited').length
    ).toBeGreaterThan(0);
  });

  it('renders every paid-plan addition the pricing card lists', () => {
    render(<PricingComparisonChart categories={COMPARISON} />);
    for (const name of getPaidPlanAdditionNames()) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });
});
