import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingSignInLink } from './MarketingSignInLink';

const meta: Meta<typeof MarketingSignInLink> = {
  title: 'Organisms/MarketingSignInLink',
  component: MarketingSignInLink,
  parameters: {
    layout: 'centered',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/',
        query: {},
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof MarketingSignInLink>;

export const Default: Story = {};

export const HomepageLogIn: Story = {
  args: {
    variant: 'ghost',
    label: 'Log in',
  },
};

export const Pill: Story = {
  args: {
    variant: 'pill',
    label: 'Sign in',
  },
};
