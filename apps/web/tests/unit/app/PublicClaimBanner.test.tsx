import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockProductFunnelVisitBeacon = vi.hoisted(() => vi.fn());

vi.mock('@/features/profile/ClaimBanner', () => ({
  ClaimBanner: ({ variant }: { readonly variant?: string }) => (
    <div data-testid='claim-banner'>variant:{variant ?? 'none'}</div>
  ),
}));

vi.mock('@/components/features/tracking/ProductFunnelVisitBeacon', () => ({
  ProductFunnelVisitBeacon: ({
    sourceSurface,
  }: {
    readonly sourceSurface: string;
  }) => {
    mockProductFunnelVisitBeacon(sourceSurface);
    return <div data-testid='product-funnel-visit-beacon' />;
  },
}));

function setSearch(search: string) {
  window.history.replaceState({}, '', `/dualipa${search}`);
}

describe('PublicClaimBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSearch('');
  });

  afterEach(() => {
    cleanup();
  });

  it('tracks claim-page visits for explicit claim intent', async () => {
    setSearch('?claim=1');

    const { PublicClaimBanner } = await import(
      '@/app/[username]/_components/PublicClaimBanner'
    );

    render(
      <PublicClaimBanner
        profileHandle='dualipa'
        displayName='Dua Lipa'
        directClaimSupported
        isClaimed={false}
        visitorState='organic_unclaimed'
      />
    );

    expect(screen.getByTestId('claim-banner')).toHaveTextContent(
      'variant:claim_intent'
    );
    expect(screen.getByTestId('product-funnel-visit-beacon')).toBeDefined();
    expect(mockProductFunnelVisitBeacon).toHaveBeenCalledWith('claim_page');
  });

  it('does not track generic organic claim banners as claim-page visits', async () => {
    const { PublicClaimBanner } = await import(
      '@/app/[username]/_components/PublicClaimBanner'
    );

    render(
      <PublicClaimBanner
        profileHandle='dualipa'
        displayName='Dua Lipa'
        directClaimSupported
        isClaimed={false}
        visitorState='organic_unclaimed'
      />
    );

    expect(screen.getByTestId('claim-banner')).toHaveTextContent(
      'variant:organic'
    );
    expect(
      screen.queryByTestId('product-funnel-visit-beacon')
    ).not.toBeInTheDocument();
    expect(mockProductFunnelVisitBeacon).not.toHaveBeenCalled();
  });
});
