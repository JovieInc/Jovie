import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LogoLink } from './LogoLink';

const meta = {
  title: 'Atoms/LogoLink',
  component: LogoLink,
  parameters: {
    layout: 'centered',
  },
  args: {
    href: '/',
    logoSize: 'sm',
    variant: 'word',
  },
} satisfies Meta<typeof LogoLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomDestination: Story = {
  args: {
    href: '/app',
    logoSize: 'md',
    prefetch: false,
    'data-testid': 'storybook-app-logo',
  },
};

export const Icon: Story = {
  args: {
    variant: 'icon',
    logoSize: 'md',
  },
};

export const Full: Story = {
  args: {
    variant: 'full',
    logoSize: 'md',
  },
};

export const Large: Story = {
  args: {
    logoSize: 'lg',
    variant: 'word',
  },
};

export const CustomHref: Story = {
  args: {
    href: '/custom',
  },
};
