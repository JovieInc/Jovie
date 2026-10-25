import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingCheckoutClient } from './OnboardingCheckoutClient';

const baseArgs = {
  plan: 'pro' as const,
  profileId: '11111111-1111-4111-8111-111111111111',
  monthlyPriceId: 'price_story_monthly',
  annualPriceId: null,
  monthlyAmount: 1200,
  annualAmount: null,
  displayName: 'Nova Lane',
  username: 'novalane',
  avatarUrl: null,
  spotifyFollowers: 5400,
  isDefaultUpsell: true,
  proofFindings: [],
};

const meta = {
  title: 'Features/Onboarding/OnboardingCheckoutClient',
  component: OnboardingCheckoutClient,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OnboardingCheckoutClient>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Charged at checkout: terms and the unchecked consent gate the CTA. */
export const ChargedToday: Story = {
  args: { ...baseArgs, firstChargeAt: null },
};

/** Upgrading inside the free trial: first charge is deferred to its end. */
export const MidTrialUpgrade: Story = {
  args: { ...baseArgs, firstChargeAt: '2026-11-08T00:00:00.000Z' },
};
