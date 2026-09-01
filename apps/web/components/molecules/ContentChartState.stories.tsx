import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentChartSkeleton, ContentChartState } from './ContentChartState';

const meta = {
  title: 'Molecules/ContentChartState',
  component: ContentChartState,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-[min(40rem,calc(100vw-2rem))] text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    state: 'empty',
    title: 'No usage data',
    message: 'No usage data available yet.',
    heightClassName: 'h-64',
  },
} satisfies Meta<typeof ContentChartState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Error: Story = {
  args: {
    state: 'error',
    title: 'Chart unavailable',
    message: 'Could not load metrics.',
    action: <button type='button'>Retry</button>,
  },
};

export const Loading: Story = {
  render: () => (
    <ContentChartSkeleton
      label='Loading Daily Active Users Chart'
      heightClassName='h-64'
    />
  ),
};
