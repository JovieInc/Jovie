import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TRUST_LOGO_ASSETS } from '@/components/media/trustLogoAssets';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { HomeTrustSection } from './HomeTrustSection';

describe('HomeTrustSection', () => {
  it('renders one logo slot per trust asset, black hole secondary on mobile', () => {
    const { container } = render(<HomeTrustSection />);
    expect(container.querySelectorAll('.homepage-trust-logo')).toHaveLength(
      TRUST_LOGO_ASSETS.length
    );
    for (const logo of container.querySelectorAll('.homepage-trust-logo')) {
      expect(logo.parentElement).toHaveClass('w-full', 'sm:w-auto');
    }
    const secondary = container.querySelectorAll(
      '[data-mobile-logo="secondary"]'
    );
    expect(secondary).toHaveLength(1);
    expect(
      screen.getByRole('region', { name: 'Artist distribution' })
    ).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.section.logoCloud
    );
  });

  it('renders only the requested logos', () => {
    render(<HomeTrustSection logoIds={['awal', 'umg']} />);
    expect(screen.getByLabelText('AWAL')).toBeInTheDocument();
    expect(screen.getByLabelText('Universal Music Group')).toBeInTheDocument();
    expect(screen.queryByLabelText('The Orchard')).toBeNull();
  });

  it('keeps the Pen contract and a caller label on the artist-profile bar', () => {
    render(
      <HomeTrustSection
        presentation='artist-profile'
        ariaLabel='Distributed by'
      />
    );
    const bar = screen.getByTestId('artist-profile-logo-bar');
    expect(bar).toHaveAttribute('aria-label', 'Distributed by');
    expect(bar).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.section.logoCloud
    );
  });
});
