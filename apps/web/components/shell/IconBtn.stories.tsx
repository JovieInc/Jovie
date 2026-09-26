import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Play } from 'lucide-react';
import { fn } from 'storybook/test';
import { IconBtn } from './IconBtn';

const meta = {
  title: 'Shell/IconBtn',
  component: IconBtn,
  parameters: {
    layout: 'centered',
  },
  args: {
    label: 'Play',
    onClick: fn(),
    children: <Play />,
  },
} satisfies Meta<typeof IconBtn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Active: Story = {
  args: { active: true },
};

export const Ghost: Story = {
  args: { tone: 'ghost' },
};

export const GhostActive: Story = {
  args: { tone: 'ghost', active: true },
};
