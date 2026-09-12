import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { AuthOfferSummary } from './AuthOfferSummary';

const meta = {
  title: 'Auth/AuthOfferSummary',
  component: AuthOfferSummary,
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/signup' },
    },
  },
} satisfies Meta<typeof AuthOfferSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignUpProTrial: Story = {
  args: {
    mode: 'sign-up',
  },
};

export const SignInContinue: Story = {
  args: {
    mode: 'sign-in',
  },
};
