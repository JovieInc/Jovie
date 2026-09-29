import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DrawerAnalyticsSummaryMetric } from './DrawerAnalyticsSummaryCard';
import { DrawerAnalyticsSummaryCard } from './DrawerAnalyticsSummaryCard';

const metrics: DrawerAnalyticsSummaryMetric[] = [
  { id: 'views', label: 'Views', value: '12.4k', hint: '+8% vs last week' },
  { id: 'clicks', label: 'Clicks', value: '3,204', hint: '+2% vs last week' },
];

const meta = {
  title: 'Molecules/Drawer/DrawerAnalyticsSummaryCard',
  component: DrawerAnalyticsSummaryCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0'>
        <Story />
      </div>
    ),
  ],
  args: {
    metrics,
    state: 'ready',
  },
} satisfies Meta<typeof DrawerAnalyticsSummaryCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: {
    state: 'loading',
  },
};

export const ErrorState: Story = {
  args: {
    state: 'error',
    errorMessage: 'Analytics unavailable right now.',
  },
};

export const Empty: Story = {
  args: {
    metrics: [],
    emptyMessage: 'No analytics for this range yet.',
  },
};

export const Dimmed: Story = {
  args: {
    dimmed: true,
  },
};
