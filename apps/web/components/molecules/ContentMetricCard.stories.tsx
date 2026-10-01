import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Eye } from 'lucide-react';
import { ContentMetricCard } from './ContentMetricCard';

const meta = {
  title: 'Molecules/ContentMetricCard',
  component: ContentMetricCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-56 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Total streams',
    value: '128.4k',
  },
} satisfies Meta<typeof ContentMetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    icon: Eye,
  },
};

export const WithSubtitle: Story = {
  args: {
    subtitle: '+4.2% vs last week',
  },
};

export const WithHeaderRight: Story = {
  args: {
    icon: Eye,
    subtitle: 'Last 28 days',
    headerRight: <span className='text-2xs text-tertiary-token'>Live</span>,
  },
};
