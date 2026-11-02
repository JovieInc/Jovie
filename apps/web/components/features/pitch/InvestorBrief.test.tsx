import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';
import { fundraisingRegistry } from '@/lib/investors/fundraising-registry';
import { InvestorBrief } from './InvestorBrief';

vi.mock('./PitchEngagement', () => ({ PitchEngagement: () => null }));

describe('investor deck evidence boundary', () => {
  it('renders the built capabilities first with a status on every capability', () => {
    const { container } = render(<InvestorBrief />);
    const slides = container.querySelectorAll('[data-pitch-slide]');
    expect(slides).toHaveLength(7);
    expect(slides[0]).toHaveAttribute('data-pitch-slide', 'product');
    const product = within(slides[0] as HTMLElement);
    for (const capability of fundraisingRegistry.operatingLoop) {
      const heading = product.getByRole('heading', { name: capability.title });
      expect(
        within(heading.closest('li') as HTMLElement).getByText(
          'BUILT, NOT CERTIFIED'
        )
      ).toBeVisible();
    }
    expect(
      product.getByText(/Release email is built but blocked/)
    ).toBeVisible();
    expect(product.getByText(/Nothing is certified/)).toBeVisible();
  });

  it('separates revenue, the blocked experiment and the funding hypothesis', () => {
    const { container } = render(<InvestorBrief />);
    const traction = within(
      container.querySelector('[data-pitch-slide="wedge"]') as HTMLElement
    );
    expect(
      traction.getByRole('heading', {
        name: '$0 revenue. Zero paying customers.',
      })
    ).toBeVisible();
    expect(traction.getByText(/Pass bar: 50 fans/)).toHaveTextContent(
      'at least 30% clicking through'
    );
    expect(
      traction.getByText(/Pending. Release email is blocked/)
    ).toBeVisible();
    const ask = within(
      container.querySelector('[data-pitch-slide="round"]') as HTMLElement
    );
    expect(ask.getByText('Hypothesis · not committed')).toBeVisible();
    expect(
      ask.getByText(/Use-of-funds hypothesis: engineering throughput/)
    ).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: new RegExp(`${ARTIST_VISIBILITY_OFFER.pro.displayName} is`),
      })
    ).toHaveTextContent(`${ARTIST_VISIBILITY_OFFER.pro.monthlyUsd}/month`);
  });

  it('keeps the one-agent account and dated engineering output distinct from customer value', () => {
    const { container } = render(<InvestorBrief investorName='Alex' />);
    expect(screen.getByText('For Alex')).toBeVisible();
    const shipping = within(
      container.querySelector('[data-pitch-slide="loop"]') as HTMLElement
    );
    expect(
      shipping.getByRole('heading', {
        name: 'I work with one auto-scaling agent, Summer.',
      })
    ).toBeVisible();
    expect(shipping.getByText(/6,818 PRs/)).toHaveTextContent(
      'November 2, 2026'
    );
    expect(shipping.getByText(/6,818 PRs/)).toHaveTextContent(
      'not customer value'
    );
    expect(shipping.getByText(/Year one went into the loop/)).toHaveTextContent(
      'Cost: a year of customer feedback.'
    );
  });

  it('does not send investors to stale assets or expose placeholders and unsupported outcomes', () => {
    const { container } = render(<InvestorBrief />);
    expect(screen.queryByText(/^For /)).not.toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
    expect(container.querySelector('a[download]')).toBeNull();
    expect(container.textContent).not.toMatch(
      /\$299|\$199|100M|X%|Z%|\bOS\b|\bplatform\b|\bsuite\b|—/u
    );
    expect(screen.getByRole('link', { name: 'Read The Deck' })).toHaveAttribute(
      'href',
      '#brief'
    );
    expect(screen.getByRole('link', { name: 'Email Tim' })).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:')
    );
  });
});
