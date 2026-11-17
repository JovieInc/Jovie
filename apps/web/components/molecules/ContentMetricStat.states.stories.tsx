import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentMetricStat } from './ContentMetricStat';

/** Rendered states of the metric stat, beside ContentMetricStat.stories.tsx. */
const meta = {
  title: 'Molecules/ContentMetricStat States',
  component: ContentMetricStat,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-48 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    label: 'Current DAU',
    value: '1,284',
  },
} satisfies Meta<typeof ContentMetricStat>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a label and value with no subtitle line. */
export const PartialNoSubtitle: Story = {};

/** Long content: a long label truncates and a long subtitle wraps. */
export const LongContentLabelAndSubtitle: Story = {
  args: {
    label: 'Daily active listeners across every connected service',
    subtitle:
      'Counted over the last 14 days from Spotify, Apple Music, YouTube and every other service that reports.',
  },
};

/** Right-to-left: an Arabic label and subtitle on a right-to-left dashboard. */
export const RtlArabicStat: Story = {
  args: {
    label: 'المستخدمون النشطون',
    subtitle: 'آخر 14 يومًا',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-48 text-primary-token'>
        <Story />
      </div>
    ),
  ],
};
