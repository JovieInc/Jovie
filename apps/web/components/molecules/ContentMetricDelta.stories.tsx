import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentMetricDelta } from './ContentMetricDelta';

const meta = {
  title: 'Molecules/ContentMetricDelta',
  component: ContentMetricDelta,
  parameters: {
    layout: 'centered',
  },
  args: {
    direction: 'up',
    polarity: 'higher-is-better',
    value: '+12.5%',
  },
} satisfies Meta<typeof ContentMetricDelta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Positive: Story = {};
