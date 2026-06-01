import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicMerchCard } from '@/lib/merch/types';
import type { Artist } from '@/types/db';
import { ProfileMerchCard } from './ProfileMerchCard';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    fill: _fill,
    sizes: _sizes,
    ...props
  }: {
    readonly alt: string;
    readonly src: string;
    readonly fill?: boolean;
    readonly sizes?: string;
    readonly [key: string]: unknown;
  }) => React.createElement('img', { alt, src, ...props }),
}));

const artist = {
  id: 'artist-1',
  handle: 'tim',
  name: 'Tim White',
} as Artist;

const card: PublicMerchCard = {
  id: '00000000-0000-4000-8000-000000000001',
  artistId: 'artist-1',
  status: 'live',
  title: 'Static Bloom Tee',
  description: 'A premium tee for Static Bloom.',
  productType: 'Premium tee',
  primaryImageUrl: 'https://cdn.test/mockup.jpg',
  mockupUrls: ['https://cdn.test/mockup.jpg'],
  printful: {
    catalogProductId: 71,
    catalogVariantIds: [4011, 4012],
    variantMap: { S_black: 4011, M_black: 4012 },
    placements: ['front'],
    techniques: ['dtg'],
    printFileUrls: ['https://cdn.test/print.png'],
    availabilityRegion: 'US',
    shippingProfile: 'standard_us',
  },
  pricing: {
    currency: 'USD',
    retailPriceCents: 4500,
    estimatedPrintfulProductCostCents: 1750,
    estimatedShippingCostCents: 525,
    stripeFeeEstimateCents: 176,
    refundReserveCents: 200,
    artistRoyaltyRateBps: 5000,
    artistPayoutPerUnitEstimateCents: 1187,
    jovieMarginPerUnitEstimateCents: 1187,
  },
  retailPriceCents: 4500,
  rankScore: 50,
  position: null,
  pinned: false,
};

describe('ProfileMerchCard', () => {
  it('links to the public merch product page with title and price', () => {
    render(<ProfileMerchCard artist={artist} card={card} />);

    const link = screen.getByTestId('profile-merch-card');
    expect(link).toHaveAttribute(
      'href',
      '/tim/merch/00000000-0000-4000-8000-000000000001'
    );
    expect(
      screen.getByRole('heading', { name: 'Static Bloom Tee' })
    ).toBeInTheDocument();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
    expect(screen.getByAltText('Static Bloom Tee')).toHaveAttribute(
      'src',
      'https://cdn.test/mockup.jpg'
    );
  });

  it('renders without a fake merch placeholder when no image URL exists', () => {
    render(
      <ProfileMerchCard
        artist={artist}
        card={{ ...card, primaryImageUrl: '', mockupUrls: [] }}
      />
    );

    expect(screen.getByText('Static Bloom Tee')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
