import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { APP_ROUTES } from '@/constants/routes';
import { ChatProposeCheckoutCard } from './ChatProposeCheckoutCard';

const meta = {
  title: 'Features/Onboarding/ChatProposeCheckoutCard',
  component: ChatProposeCheckoutCard,
  parameters: {
    layout: 'padded',
    chromatic: { viewports: [390, 1280] },
  },
} satisfies Meta<typeof ChatProposeCheckoutCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pro: Story = {
  args: {
    payload: {
      action: 'propose_checkout',
      plan: 'pro',
      handoffUrl: '/onboarding/checkout?plan=pro',
    },
  },
};

export const NoPlanChosen: Story = {
  args: {
    payload: {
      action: 'propose_checkout',
      plan: null,
      handoffUrl: '/onboarding/checkout',
    },
  },
};

export const Free: Story = {
  args: {
    payload: {
      action: 'propose_checkout',
      plan: 'free',
      handoffUrl: `${APP_ROUTES.ONBOARDING_CHECKOUT}?plan=free`,
    },
  },
};
export const Max: Story = {
  args: {
    payload: {
      action: 'propose_checkout',
      plan: 'max',
      handoffUrl: `${APP_ROUTES.ONBOARDING_CHECKOUT}?plan=max`,
    },
  },
};
export const FallbackRoute: Story = {
  args: {
    payload: {
      action: 'propose_checkout',
      plan: null,
      handoffUrl: 'https://example.com',
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'Continue' })
    ).toHaveAttribute('href', APP_ROUTES.ONBOARDING_CHECKOUT);
  },
};
