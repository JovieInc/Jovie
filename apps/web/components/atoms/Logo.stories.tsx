import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Logo } from './Logo';

const meta = {
  title: 'Atoms/Logo',
  component: Logo,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Wordmark: Story = {
  args: {
    size: 'md',
    tone: 'auto',
  },
};

export const Icon: Story = {
  args: {
    variant: 'icon',
    size: 'lg',
    tone: 'color',
  },
};

export const FullWordmark: Story = {
  args: {
    variant: 'full',
    size: 'sm',
    tone: 'muted',
  },
};

export const Decorative: Story = {
  args: {
    variant: 'word',
    size: 'xs',
    'aria-hidden': true,
  },
};
