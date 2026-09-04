import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingSectionHeading } from './MarketingSectionHeading';

const meta = {
  title: 'Marketing/Primitives/MarketingSectionHeading',
  component: MarketingSectionHeading,
  parameters: { layout: 'centered' },
  args: {
    id: 'marketing-section-heading',
    children: 'Build a direct audience',
  },
} satisfies Meta<typeof MarketingSectionHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
