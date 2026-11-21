import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { OnboardingCheckoutClient } from '@/app/onboarding/checkout/OnboardingCheckoutClient';
import type { OnboardingCatalogPreview } from '@/lib/onboarding/catalog-preview';

/**
 * /onboarding/checkout across live-profile upsells and proofPending (<50k
 * unproven Spotify claim) catalog previews, verifying that "live" copy is
 * suppressed while stored catalog releases remain visible.
 */
const catalogFixture: OnboardingCatalogPreview = {
  total: 2,
  releases: [
    {
      id: 'rel-1',
      title: 'Night Drive',
      releaseDate: '2026-09-14',
      releaseType: 'single',
      artworkUrl: null,
      spotifyUrl: 'https://open.spotify.com/album/rel-1',
    },
    {
      id: 'rel-2',
      title: 'Static Bloom',
      releaseDate: '2025-11-02',
      releaseType: 'album',
      artworkUrl: null,
      spotifyUrl: 'https://open.spotify.com/album/rel-2',
    },
  ],
};

const meta = {
  title: 'Pages/Onboarding/Checkout Surface',
  component: OnboardingCheckoutClient,
  parameters: {
    layout: 'fullscreen',
    chromatic: { viewports: [390, 1440] },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/onboarding/checkout',
      },
    },
  },
  args: {
    plan: 'pro',
    profileId: '00000000-0000-4000-8000-000000000001',
    monthlyPriceId: 'price_monthly_pro',
    annualPriceId: 'price_annual_pro',
    monthlyAmount: 1900,
    annualAmount: 18000,
    displayName: 'Signal Artist',
    username: 'signalartist',
    avatarUrl: null,
    spotifyFollowers: 1840,
    isDefaultUpsell: true,
    profileLive: true,
    proofPending: false,
    catalog: catalogFixture,
  },
} satisfies Meta<typeof OnboardingCheckoutClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LiveProfileWithCatalog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId('checkout-catalog-preview')
    ).toHaveTextContent('2 releases on your page');
  },
};

export const ProofPendingLowReachWithCatalog: Story = {
  args: {
    profileLive: false,
    proofPending: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId('checkout-catalog-preview')
    ).toHaveTextContent('2 releases ready for your page');
    await expect(
      canvas.getByTestId('checkout-proof-pending-terms')
    ).toBeVisible();
  },
};
