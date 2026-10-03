import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VisibilityAuditOffer } from './VisibilityAuditOffer';

describe('VisibilityAuditOffer', () => {
  it('renders nothing when the offer is hidden', async () => {
    const { queryByTestId } = render(
      <VisibilityAuditOffer loadOffer={async () => null} />
    );
    expect(queryByTestId('visibility-audit-offer')).toBeNull();
    await Promise.resolve();
    expect(queryByTestId('visibility-audit-offer')).toBeNull();
  });

  it('renders the payment link when the offer is visible', async () => {
    render(
      <VisibilityAuditOffer
        loadOffer={async () => ({
          visible: true,
          href: 'https://buy.stripe.com/test_a1b2c3',
          priceUsd: 199,
          label: 'Digital Footprint & Visibility Audit — $199',
          detail: 'This $199 audit is credited toward the first month.',
        })}
      />
    );
    const link = await screen.findByRole('link', {
      name: 'Digital Footprint & Visibility Audit — $199',
    });
    expect(link.getAttribute('href')).toBe(
      'https://buy.stripe.com/test_a1b2c3'
    );
  });
});
