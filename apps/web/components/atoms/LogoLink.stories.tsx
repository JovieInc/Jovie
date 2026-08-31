import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LogoLink } from './LogoLink';

const meta = {
  title: 'Atoms/LogoLink',
  component: LogoLink,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LogoLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Home: Story = {};

export const CustomDestination: Story = {
  args: {
    href: '/app',
    logoSize: 'md',
    prefetch: false,
    'data-testid': 'storybook-app-logo',
  },
};

export const IconLink: Story = {
  args: {
    href: '/app',
    variant: 'icon',
    logoSize: 'lg',
  },
};
