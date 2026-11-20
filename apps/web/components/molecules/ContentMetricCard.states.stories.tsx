import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AlertTriangle, Eye } from 'lucide-react';
import { ContentMetricCard } from './ContentMetricCard';
import { ContentMetricCardSkeleton } from './ContentMetricCardSkeleton';

/** Rendered states of the metric card, beside ContentMetricCard.stories.tsx. */
const meta = {
  title: 'Molecules/ContentMetricCard States',
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

/** Loading: the matching skeleton holds the card's line boxes until data lands. */
export const LoadingSkeletonFrame: Story = {
  render: () => <ContentMetricCardSkeleton layout='icon-chip' />,
};

/** Empty: no streams yet, so the value is zero with a hint. */
export const EmptyZeroValue: Story = {
  args: {
    layout: 'icon-chip',
    icon: Eye,
    value: 0,
    subtitle: 'No streams in the last 28 days',
  },
};

/** Error: the inline chip in its error tone for a failing metric. */
export const ErrorTone: Story = {
  args: {
    layout: 'icon-chip-inline',
    tone: 'error',
    icon: AlertTriangle,
    label: 'Failed payouts',
    value: 3,
  },
};

/** Partial: only a label and value, with no icon, subtitle or header slot. */
export const PartialLabelAndValue: Story = {
  args: {
    layout: 'icon-chip',
  },
};

/** Right-to-left: an Arabic label and subtitle on a right-to-left dashboard. */
export const RtlArabicMetric: Story = {
  args: {
    layout: 'icon-chip',
    icon: Eye,
    label: 'إجمالي الاستماعات',
    subtitle: 'آخر 28 يومًا',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-56 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
};
