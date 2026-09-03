import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ContentMetricStat,
  ContentMetricStatSkeleton,
} from './ContentMetricStat';

const meta = {
  title: 'Molecules/ContentMetricStat',
  component: ContentMetricStat,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-48 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Current DAU',
    value: '1,284',
    subtitle: 'Last 14 days',
  },
} satisfies Meta<typeof ContentMetricStat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Skeleton: Story = {
  render: () => <ContentMetricStatSkeleton />,
};
