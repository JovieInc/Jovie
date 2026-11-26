import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { PerformanceCard } from './PerformanceCard';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-80'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='w-80'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the performance card. The canonical story stays in
 * PerformanceCard.stories.tsx; these show a card with no series, a single
 * range, a long title and the document direction.
 */
const meta = {
  title: 'Shell/PerformanceCard States',
  component: PerformanceCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'title',
        'metricLabel',
        'pointsByRange',
        'trend',
        'delta',
      ],
    },
  },
  decorators: [Frame],
  args: {
    title: 'Smart Link',
    metricLabel: 'clicks',
    pointsByRange: { '7d': [120, 132, 101, 154, 190, 172, 210] },
    trend: 'down',
    delta: 8.2,
  },
} satisfies Meta<typeof PerformanceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no range has any points yet. */
export const EmptyNoSeries: Story = {
  args: { pointsByRange: {}, trend: 'flat', delta: 0 },
};

/** Partial: a single range, so the range selector is hidden. */
export const PartialSingleRange: Story = {};

/** Long content: a long title and metric label wrap. */
export const LongContentLabels: Story = {
  args: {
    title: 'Smart link clicks from every connected streaming platform',
    metricLabel: 'clicks across all platforms combined',
    pointsByRange: {
      '7d': [120, 132, 101, 154, 190, 172, 210],
      '30d': [90, 110, 105, 130, 140, 150, 172, 210],
    },
    trend: 'up',
  },
};

/** Rtl: the card follows the document direction. */
export const RtlDirection: Story = {
  decorators: [RtlFrame],
  args: {
    pointsByRange: {
      '7d': [120, 132, 101, 154, 190, 172, 210],
      '30d': [90, 110, 105, 130, 140, 150, 172, 210],
    },
    trend: 'up',
  },
};
