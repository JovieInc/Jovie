import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Eye } from 'lucide-react';
import { ContentMetricCard } from './ContentMetricCard';
import { ContentMetricCardSkeleton } from './ContentMetricCardSkeleton';

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

export const IconChip: Story = {
  args: {
    layout: 'icon-chip',
    label: 'QR Scans',
    value: '1.2k',
    subtitle: 'Fans who scanned your QR',
    icon: Eye,
    tone: 'success',
  },
};

export const CompactIconChip: Story = {
  args: {
    layout: 'icon-chip',
    density: 'compact',
    label: 'Total Revenue',
    value: '$123.45',
    icon: Eye,
    tone: 'success',
  },
};

export const CompactLoadingAndLoaded: Story = {
  args: CompactIconChip.args,
  render: args => (
    <div className='space-y-3'>
      <div data-testid='loading-metric'>
        <ContentMetricCardSkeleton
          layout='icon-chip'
          density='compact'
          showSubtitle={false}
        />
      </div>
      <div data-testid='loaded-metric'>
        <ContentMetricCard {...args} />
      </div>
    </div>
  ),
};

export const InlineIconChip: Story = {
  args: {
    layout: 'icon-chip-inline',
    label: 'Waitlisted',
    value: '1,234',
    icon: Eye,
    tone: 'accent',
  },
};

export const LongInlineLabel: Story = {
  args: {
    ...InlineIconChip.args,
    label: 'Waitlisted creators awaiting an invitation',
  },
};
