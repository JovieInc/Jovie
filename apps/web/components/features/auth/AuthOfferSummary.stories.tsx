import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { clearPlanIntent } from '@/lib/auth/plan-intent';

import { AuthOfferSummary } from './AuthOfferSummary';

const meta = {
  title: 'Auth/AuthOfferSummary',
  component: AuthOfferSummary,
  beforeEach: () => clearPlanIntent(),
  args: {
    enabled: true,
  },
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/signup',
        query: { plan: 'pro', interval: 'month' },
      },
    },
  },
} satisfies Meta<typeof AuthOfferSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyNoOffer: Story = {
  args: { mode: 'sign-up' },
  parameters: {
    nextjs: {
      navigation: { query: { plan: '', interval: '' } },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByTestId('auth-offer-summary')
    ).not.toBeInTheDocument();
  },
};

export const SignUpProTrial: Story = {
  args: {
    mode: 'sign-up',
    enabled: true,
  },
};

export const SignInContinue: Story = {
  args: {
    mode: 'sign-in',
    enabled: true,
  },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/signin',
        query: { plan: 'pro', interval: 'month' },
      },
    },
  },
};

/** Long content: the Max recap carries the longest note and wraps inside the card. */
export const LongMaxOfferNote: Story = {
  args: { mode: 'sign-up', enabled: true },
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/signup', query: { plan: 'max' } },
    },
  },
};

/** RTL: the centred recap follows a right-to-left auth shell. */
export const RtlSignUpProTrial: Story = {
  args: { mode: 'sign-up', enabled: true },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
