import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TippingEmptyState, TippingMetricsSkeleton } from './EmptyStates';

const meta: Meta<typeof TippingEmptyState> = {
  title: 'Tipping/EmptyStates',
  component: TippingEmptyState,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['no-venmo', 'pending-metrics'],
      description: 'Type of empty state to display',
    },
    animate: {
      control: 'boolean',
      description: 'Whether to animate the empty state on mount',
    },
    className: {
      control: 'text',
      description: 'Additional CSS classes to apply',
    },
  },
};

export default meta;
type Story = StoryObj<typeof TippingEmptyState>;

export const NoVenmo: Story = {
  args: {
    type: 'no-venmo',
    animate: true,
  },
};

export const PendingMetrics: Story = {
  args: {
    type: 'pending-metrics',
    animate: true,
  },
};

export const NoAnimation: Story = {
  args: {
    type: 'no-venmo',
    animate: false,
  },
};

export const DarkMode: Story = {
  args: {
    type: 'pending-metrics',
    animate: true,
  },
  parameters: {
    backgrounds: { default: 'dark' },
    themes: { themeOverride: 'dark' },
  },
};

// Skeleton stories
export const MetricsSkeleton: StoryObj<typeof TippingMetricsSkeleton> = {
  render: () => <TippingMetricsSkeleton />,
};

export const MetricsSkeletonFewRows: StoryObj<typeof TippingMetricsSkeleton> = {
  render: () => <TippingMetricsSkeleton rows={1} />,
};

export const MetricsSkeletonDark: StoryObj<typeof TippingMetricsSkeleton> = {
  render: () => <TippingMetricsSkeleton />,
  parameters: {
    backgrounds: { default: 'dark' },
    themes: { themeOverride: 'dark' },
  },
};
