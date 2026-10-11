import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatProposeCheckoutCard } from './ChatProposeCheckoutCard';

const meta = {
  title: 'Features/Onboarding/ChatProposeCheckoutCard',
  component: ChatProposeCheckoutCard,
  parameters: {
    layout: 'centered',
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
