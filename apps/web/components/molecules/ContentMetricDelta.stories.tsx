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
    value: '+12.5%',
  },
} satisfies Meta<typeof ContentMetricDelta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Positive: Story = {};

export const Negative: Story = {
  args: {
    direction: 'down',
    value: '-4.0%',
  },
};

export const Flat: Story = {
  args: {
    direction: 'flat',
    value: '+0.0%',
  },
};

export const AllDirections: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <ContentMetricDelta direction='up' value='+12.5%' />
      <ContentMetricDelta direction='down' value='-4.0%' />
      <ContentMetricDelta direction='flat' value='+0.0%' />
    </div>
  ),
};
