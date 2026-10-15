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

export const IconChipLoadingAndLoaded: Story = {
  render: args => (
    <div className='space-y-3'>
      {(
        [
          {
            layout: 'icon-chip',
            density: 'default',
            subtitle: 'Recent visits',
          },
          { layout: 'icon-chip', density: 'compact', subtitle: undefined },
          {
            layout: 'icon-chip-inline',
            density: 'default',
            subtitle: undefined,
          },
        ] as const
      ).map(({ layout, density, subtitle }) => (
        <div key={`${layout}-${density}`} className='space-y-3'>
          <div data-testid={`${layout}-${density}-loading`}>
            <ContentMetricCardSkeleton
              layout={layout}
              density={density}
              showSubtitle={Boolean(subtitle)}
            />
          </div>
          <div data-testid={`${layout}-${density}-loaded`}>
            <ContentMetricCard
              {...args}
              layout={layout}
              density={density}
              subtitle={subtitle}
              icon={Eye}
            />
          </div>
        </div>
      ))}
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
