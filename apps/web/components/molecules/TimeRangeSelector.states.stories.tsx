import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { TimeRangeSelector } from './TimeRangeSelector';

const meta = {
  title: 'Molecules/TimeRangeSelector/States',
  component: TimeRangeSelector,
  parameters: { layout: 'centered' },
  decorators: [
    function SelectorFrame(Story) {
      return (
        <div className='w-96 max-w-full bg-surface-page p-4 text-primary-token'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    value: '7d',
    onValueChange: fn(),
    ranges: ['1d', '7d', '30d', '90d'],
    variant: 'segment',
  },
} satisfies Meta<typeof TimeRangeSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no ranges to offer, so the control has no options. */
export const EmptyNoRanges: Story = { args: { ranges: [] } };

/** Partial: the plan retention disables the wider ranges. */
export const PartialRetentionLimited: Story = {
  args: { maxRetentionDays: 30 },
};

/** Long content: every range, including all time, in a narrow container. */
export const LongContentAllRanges: Story = {
  args: { ranges: ['1d', '7d', '30d', '90d', 'all'] },
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-64'>
          <Story />
        </div>
      );
    },
  ],
};

/** Permission denied: ranges locked behind a plan upgrade in the menu. */
export const PermissionDeniedLockedRanges: Story = {
  args: { variant: 'menu', lockedRanges: ['90d'] },
};

/** Rtl: the control mirrors in a right-to-left layout. */
export const RtlSegment: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-96 max-w-full p-4'>
          <Story />
        </div>
      );
    },
  ],
};
