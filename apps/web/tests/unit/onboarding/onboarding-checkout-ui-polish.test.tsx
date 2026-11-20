import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/onboarding/checkout',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/organisms/AppShellFrame', () => ({
  AppShellFrame: ({
    main,
    containerClassName: _containerClassName,
    contentClassName: _contentClassName,
    rightPanel: _rightPanel,
    ...props
  }: {
    readonly main?: React.ReactNode;
    readonly containerClassName?: string;
    readonly contentClassName?: string;
    readonly rightPanel?: React.ReactNode;
    readonly [key: string]: unknown;
  }) => (
    <div data-testid='app-shell-frame' {...props}>
      {main}
    </div>
  ),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/app/onboarding/actions/upgrade-offer', () => ({
  recordOnboardingUpgradeOfferDecision: vi.fn().mockResolvedValue({ ok: true }),
}));

import { OnboardingCheckoutClient } from '@/app/onboarding/checkout/OnboardingCheckoutClient';

describe('OnboardingCheckoutClient UI polish', () => {
  it('renders uncropped catalog artwork and a 44px focusable skip control', () => {
    render(
      <OnboardingCheckoutClient
        plan='pro'
        profileId='11111111-1111-4111-8111-111111111111'
        monthlyPriceId='price_pro_monthly'
        annualPriceId='price_pro_annual'
        monthlyAmount={1200}
        annualAmount={11500}
        displayName='Luna Harbor'
        username='lunaharbor'
        avatarUrl={null}
        spotifyFollowers={1200}
        isDefaultUpsell
        catalog={{
          total: 2,
          releases: [
            {
              id: 'rel-2018',
              title: 'Echoes from 2018',
              releaseType: 'album',
              releaseDate: '2018-09-14',
              artworkUrl: 'https://example.com/echoes.jpg',
              spotifyUrl: 'https://open.spotify.com/album/rel-2018',
            },
          ],
        }}
      />
    );

    const catalogCard = screen.getByTestId('checkout-catalog-preview');
    const img = catalogCard.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.className).toContain('object-contain');
    expect(img?.className).not.toContain('object-cover');

    const skipBtn = screen.getByTestId('onboarding-checkout-skip');
    expect(skipBtn).toHaveTextContent('Keep My Free Profile');
    expect(skipBtn.className).toContain('focus-ring-themed');
    expect(skipBtn.className).toContain('before:min-h-11');
    expect(skipBtn.className).toContain('before:content-empty');
  });
});
