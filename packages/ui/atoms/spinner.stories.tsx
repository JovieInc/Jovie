import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { Spinner } from './spinner';

const meta: Meta<typeof Spinner> = {
  title: 'shadcn/Spinner',
  component: Spinner,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Inline spinner for buttons and in-flight actions. Never use inside Skeleton layouts.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Small: Story = {
  args: { size: 'sm' },
};

export const Medium: Story = {
  args: { size: 'md' },
};

export const Large: Story = {
  args: { size: 'lg' },
};

export const Muted: Story = {
  args: { tone: 'muted' },
};