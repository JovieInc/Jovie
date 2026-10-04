import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TRUST_LOGO_ASSETS } from '@/components/media/trustLogoAssets';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { LOGO_PERMISSION_FIXTURES } from '@/data/product-truth/logo-permissions.fixture';
import { HomeTrustSection } from './HomeTrustSection';

const granted = {
  placement: { page: '/' },
  fixturePermissions: LOGO_PERMISSION_FIXTURES,
} as const;

describe('HomeTrustSection', () => {
  it('renders nothing when no permission covers the placement', () => {
    const { container } = render(
      <HomeTrustSection placement={{ page: '/' }} fixturePermissions={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing from the real registry, which holds no grants', () => {
    const { container } = render(
      <HomeTrustSection placement={{ page: '/' }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['card', 'inline-strip'] as const)(
    'binds the declared %s logo section on its actual root',
    presentation => {
      render(
        <HomeTrustSection
          {...granted}
          presentation={presentation}
          sectionVariant='inline-strip'
        />
      );
      const root = screen.getByTestId('marketing-section-logo-cloud');
      expect(root.tagName).toBe('SECTION');
      expect(root).toHaveAttribute(
        'data-marketing-owner',
        'apps/web/components/features/home/HomeTrustSection.tsx'
      );
      expect(root).toHaveAttribute('data-marketing-variant', 'inline-strip');
      expect(screen.queryByTestId('homepage-trust')).toBeNull();
    }
  );
  it('renders one logo slot per trust asset, black hole secondary on mobile', () => {
    const { container } = render(<HomeTrustSection {...granted} />);
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
    render(<HomeTrustSection {...granted} logoIds={['awal', 'umg']} />);
    expect(screen.getByLabelText('AWAL')).toBeInTheDocument();
    expect(screen.getByLabelText('Universal Music Group')).toBeInTheDocument();
    expect(screen.queryByLabelText('The Orchard')).toBeNull();
  });

  it('keeps the Pen contract and a caller label on the artist-profile bar', () => {
    render(
      <HomeTrustSection
        {...granted}
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
