import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HomeHero } from '@/components/home/HomeHero';

const mockUseFeatureFlagWithLoading = vi.fn();

vi.mock('@/lib/analytics', () => ({
  FEATURE_FLAGS: {
    CLAIM_HANDLE: 'feature_claim_handle',
    HERO_SPOTIFY_CLAIM_FLOW: 'feature_hero_spotify_claim_flow',
  },
  useFeatureFlagWithLoading: (...args: unknown[]) =>
    mockUseFeatureFlagWithLoading(...args),
}));

vi.mock('@/components/organisms/HeroSection', () => ({
  HeroSection: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock('@/components/home/ClaimHandleForm', () => ({
  ClaimHandleForm: () => <div data-testid='claim-handle-form' />,
}));

vi.mock('@/components/home/HeroSpotifySearch', () => ({
  HeroSpotifySearch: () => <div data-testid='hero-spotify-search' />,
}));

describe('HomeHero', () => {
  it('defaults to handle claim flow', () => {
    mockUseFeatureFlagWithLoading
      .mockReturnValueOnce({ enabled: true, loading: false })
      .mockReturnValueOnce({ enabled: false, loading: false });

    render(<HomeHero />);

    expect(screen.getByTestId('claim-handle-form')).toBeInTheDocument();
    expect(screen.queryByTestId('hero-spotify-search')).not.toBeInTheDocument();
  });

  it('renders spotify search when spotify claim flow flag is enabled', () => {
    mockUseFeatureFlagWithLoading
      .mockReturnValueOnce({ enabled: true, loading: false })
      .mockReturnValueOnce({ enabled: true, loading: false });

    render(<HomeHero />);

    expect(screen.getByTestId('hero-spotify-search')).toBeInTheDocument();
  });
});
