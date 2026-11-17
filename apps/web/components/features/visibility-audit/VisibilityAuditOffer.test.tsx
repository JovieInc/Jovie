import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { VisibleVisibilityAuditOffer } from '@/lib/visibility-audit/offer';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { VisibilityAuditOffer } from './VisibilityAuditOffer';

const OFFER: VisibleVisibilityAuditOffer = {
  visible: true,
  href: 'https://buy.stripe.com/test_a1b2c3',
  priceUsd: 199,
  label: 'Digital Footprint & Visibility Audit — $199',
  detail: 'This $199 audit is credited toward the first month.',
};

describe('VisibilityAuditOffer', () => {
  it('renders nothing when the offer is hidden', async () => {
    const loadOffer = vi.fn(async () => null);
    const { container, queryByTestId } = render(
      <VisibilityAuditOffer loadOffer={loadOffer} />
    );
    expect(queryByTestId('visibility-audit-offer')).toBeNull();
    await waitFor(() => expect(loadOffer).toHaveBeenCalledTimes(1));
    expect(queryByTestId('visibility-audit-offer')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders the payment link when the offer is visible', async () => {
    const { container } = render(
      <VisibilityAuditOffer loadOffer={async () => OFFER} />
    );
    const link = await screen.findByRole('link', {
      name: 'Digital Footprint & Visibility Audit — $199',
    });
    expect(link.getAttribute('href')).toBe(
      'https://buy.stripe.com/test_a1b2c3'
    );
    expect(
      screen.getByRole('complementary', { name: 'Visibility Audit Offer' })
    ).toHaveTextContent('This $199 audit is credited toward the first month.');
    await expectNoA11yViolations(container);
  });

  it('reaches the offer link by keyboard', async () => {
    const user = userEvent.setup();
    render(<VisibilityAuditOffer loadOffer={async () => OFFER} />);
    const link = await screen.findByRole('link');

    await user.tab();

    expect(link).toHaveFocus();
  });

  it.each([
    ['a failed request', new Error('Offer request failed')],
    ['a dropped connection', new TypeError('Failed to fetch')],
  ])('stays hidden after %s', async (_label, error) => {
    const loadOffer = vi.fn(() => Promise.reject(error));
    const { container } = render(
      <VisibilityAuditOffer loadOffer={loadOffer} />
    );

    await waitFor(() => expect(loadOffer).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(screen.queryByTestId('visibility-audit-offer')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders long and right-to-left offer copy in full', async () => {
    const detail =
      'يُخصم هذا التدقيق من الشهر الأول في Artist Presence عند الترقية خلال ثلاثين يومًا من الشراء.';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <VisibilityAuditOffer
          loadOffer={async () => ({
            ...OFFER,
            label:
              'تدقيق الحضور الرقمي للفنانين والعلامات والمديرين — 199 دولارًا',
            detail,
          })}
        />
      </div>
    );

    expect(
      await screen.findByRole('link', {
        name: 'تدقيق الحضور الرقمي للفنانين والعلامات والمديرين — 199 دولارًا',
      })
    ).toBeInTheDocument();
    expect(screen.getByText(detail)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
