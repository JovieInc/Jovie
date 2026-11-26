import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentMetricDelta } from './ContentMetricDelta';

/** Rendered states of the metric delta, beside ContentMetricDelta.stories.tsx. */
const meta = {
  title: 'Molecules/ContentMetricDelta States',
  component: ContentMetricDelta,
  parameters: {
    layout: 'centered',
  },
  args: {
    direction: 'up',
    polarity: 'higher-is-better',
    value: '+12.5%',
  },
} satisfies Meta<typeof ContentMetricDelta>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no change over the range, shown flat at zero. */
export const ZeroChangeFlat: Story = {
  args: {
    direction: 'flat',
    value: '0%',
    'aria-label': 'No change from last week',
  },
};

/** Partial: a falling value with no spoken label, so the visible text is read. */
export const PartialNoLabel: Story = {
  args: {
    direction: 'down',
    value: '-4.1%',
  },
};

/** Long content: a long comparison next to the value in a narrow cell. */
export const LongContentComparison: Story = {
  args: {
    value: '+1,284 listeners vs. the previous 28 days',
  },
  decorators: [
    Story => (
      <div className='w-40'>
        <Story />
      </div>
    ),
  ],
};

/** Right-to-left: an Arabic spoken label on a right-to-left dashboard. */
export const RtlArabicLabel: Story = {
  args: {
    'aria-label': 'ارتفاع بنسبة 12.5٪',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
