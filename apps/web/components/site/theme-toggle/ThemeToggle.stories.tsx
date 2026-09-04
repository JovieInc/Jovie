import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ThemeToggle } from './ThemeToggle';

const meta = {
  title: 'Site/ThemeToggle/ThemeToggle',
  component: ThemeToggle,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Theme preference control with hydration-safe loading, icon and segmented appearances, keyboard shortcut description, and linear surface treatment.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Icon: Story = {
  args: {
    appearance: 'icon',
    shortcutKey: 'T',
  },
};

export const Segmented: Story = {
  args: {
    appearance: 'segmented',
    shortcutKey: 'T',
  },
};

export const LinearSegmented: Story = {
  args: {
    appearance: 'segmented',
    shortcutKey: 'T',
    variant: 'linear',
  },
};
