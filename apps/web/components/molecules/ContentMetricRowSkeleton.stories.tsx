import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentMetricRowSkeleton } from './ContentMetricRowSkeleton';

const meta = {
  title: 'Molecules/ContentMetricRowSkeleton',
  component: ContentMetricRowSkeleton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 space-y-2 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContentMetricRowSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Stacked: Story = {
  render: () => (
    <>
      <ContentMetricRowSkeleton />
      <ContentMetricRowSkeleton />
      <ContentMetricRowSkeleton />
    </>
  ),
};
