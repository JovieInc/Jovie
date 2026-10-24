import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PriorityGlyph } from './PriorityGlyph';

const meta = {
  title: 'Shell/PriorityGlyph',
  component: PriorityGlyph,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof PriorityGlyph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const None: Story = {
  args: {
    priority: 'none',
  },
};

export const Low: Story = {
  args: {
    priority: 'low',
  },
};

export const Medium: Story = {
  args: {
    priority: 'medium',
  },
};

export const High: Story = {
  args: {
    priority: 'high',
  },
};

export const Urgent: Story = {
  args: {
    priority: 'urgent',
  },
};
