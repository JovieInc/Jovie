import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OnboardingCatalogPreview } from '@/lib/onboarding/catalog-preview';

const isCodeFlagEnabledMock = vi.fn();

vi.mock('@/lib/flags/code-flags', () => ({
  isCodeFlagEnabled: (...args: unknown[]) => isCodeFlagEnabledMock(...args),
}));

const storedPreview: OnboardingCatalogPreview = {
  total: 2,
  releases: [
    {
      id: 'stored-1',
      title: 'Stored Release',
      releaseType: 'single',
      artworkUrl: null,
      spotifyUrl: 'https://open.spotify.com/album/stored-1',
    },
  ],
};

describe('resolveOnboardingCheckoutCatalog', () => {
  beforeEach(() => {
    isCodeFlagEnabledMock.mockReset();
  });

  it('drops stored catalog when FEATURE_ONBOARDING_VALUE_BEFORE_PAYWALL is off', async () => {
    isCodeFlagEnabledMock.mockReturnValue(false);
    const { resolveOnboardingCheckoutCatalog } = await import(
      '@/lib/onboarding/catalog-preview.server'
    );

    const catalog = await resolveOnboardingCheckoutCatalog({
      storedCatalog: storedPreview,
      spotifyArtistId: 'spotify-artist-id',
    });

    expect(catalog).toBeNull();
    expect(isCodeFlagEnabledMock).toHaveBeenCalledWith(
      'ONBOARDING_VALUE_BEFORE_PAYWALL'
    );
  });

  it('returns stored catalog when the kill switch is on', async () => {
    isCodeFlagEnabledMock.mockReturnValue(true);
    const { resolveOnboardingCheckoutCatalog } = await import(
      '@/lib/onboarding/catalog-preview.server'
    );

    const catalog = await resolveOnboardingCheckoutCatalog({
      storedCatalog: storedPreview,
      spotifyArtistId: 'spotify-artist-id',
    });

    expect(catalog).toEqual(storedPreview);
  });
});
