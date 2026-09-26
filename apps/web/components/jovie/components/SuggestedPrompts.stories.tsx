import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SuggestedPrompts } from './SuggestedPrompts';

const meta = {
  title: 'Jovie/SuggestedPrompts',
  component: SuggestedPrompts,
  args: {
    onSelect: fn(),
  },
} satisfies Meta<typeof SuggestedPrompts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rail: Story = {};

export const Grid: Story = {
  args: {
    layout: 'grid',
  },
};

export const FirstSession: Story = {
  args: {
    isFirstSession: true,
  },
};
