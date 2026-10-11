import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Sparkles, Trash2 } from 'lucide-react';
import { fn } from 'storybook/test';
import { ActivityHoverRow } from './ActivityHoverRow';

const meta = {
  title: 'Shell/ActivityHoverRow',
  component: ActivityHoverRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-base p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    icon: Sparkles,
    label: 'Spotify Canvas regenerated',
    meta: '2m ago',
    onClick: fn(),
  },
} satisfies Meta<typeof ActivityHoverRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Running: Story = {
  args: {
    running: true,
    iconAccent: true,
  },
};

export const Danger: Story = {
  args: {
    icon: Trash2,
    label: 'Release deleted',
    meta: 'now',
    danger: true,
  },
};
