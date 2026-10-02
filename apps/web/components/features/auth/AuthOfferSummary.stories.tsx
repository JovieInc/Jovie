import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { AuthOfferSummary } from './AuthOfferSummary';

const meta = {
  title: 'Auth/AuthOfferSummary',
  component: AuthOfferSummary,
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
