import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingCheckoutClient } from '@/app/onboarding/checkout/OnboardingCheckoutClient';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';

const meta = {
  title: 'Features/Dashboard/Onboarding/OnboardingCheckoutClient',
  component: OnboardingCheckoutClient,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
  args: {
    plan: 'pro',
    profileId: null,
    monthlyPriceId: 'price_storybook',
    annualPriceId: null,
    monthlyAmount: toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd),
    annualAmount: null,
    displayName: 'Avery Stone',
    username: 'averystone',
    avatarUrl: null,
    spotifyFollowers: null,
    isDefaultUpsell: true,
  },
} satisfies Meta<typeof OnboardingCheckoutClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MonthlyOffer: Story = {};
