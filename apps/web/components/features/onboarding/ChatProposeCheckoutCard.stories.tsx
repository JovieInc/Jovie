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

export const Empty: Story = {
  args: {
    payload: {
      action: 'propose_checkout',
      plan: null,
      handoffUrl: '',
    },
  },
};

export const LongContentNarrow: Story = {
  args: {
    payload: {
      action: 'propose_checkout',
      plan: 'max',
      handoffUrl: '/onboarding/checkout?plan=max',
    },
  },
  render: args => (
    <div className='w-60'>
      <ChatProposeCheckoutCard {...args} />
    </div>
  ),
};

export const Rtl: Story = {
  args: {
    payload: {
      action: 'propose_checkout',
      plan: 'pro',
      handoffUrl: '/onboarding/checkout?plan=pro',
    },
  },
  render: args => (
    <div dir='rtl' lang='ar' className='w-80'>
      <ChatProposeCheckoutCard {...args} />
    </div>
  ),
};
