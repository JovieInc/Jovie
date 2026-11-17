import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { LabelPills } from './LabelPills';

const row: Decorator = function TaskRow(Story) {
  return (
    <div className='flex w-64 items-center gap-2'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='flex w-64 items-center gap-2'>
      <Story />
    </div>
  );
};

/** State coverage for task-row labels; Default lives in LabelPills.stories.tsx. */
const meta = {
  title: 'Shell/LabelPills States',
  component: LabelPills,
  parameters: { layout: 'centered' },
  decorators: [row],
  args: { labels: ['single', 'explicit'] },
} satisfies Meta<typeof LabelPills>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a task with no labels renders nothing. */
export const EmptyNoLabels: Story = {
  args: { labels: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.group\\/labels')).toBeNull();
  },
};

/** Partial: a single label shows with no +N collapse chip. */
export const PartialSingleLabel: Story = {
  args: { labels: ['backend'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('backend')).toBeVisible();
    await expect(canvas.queryByText(/^\+\d+$/)).toBeNull();
  },
};

/** Long content: many long labels collapse behind +N until hover. */
export const LongContentManyLabels: Story = {
  args: {
    labels: [
      'release-week-marketing-push',
      'playlist pitching',
      'editorial',
      'radio',
      'press',
      'sync licensing',
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('+5')).toBeInTheDocument();
  },
};

/** Right-to-left: Arabic labels in an RTL task row. */
export const RtlArabic: Story = {
  args: { labels: ['تسويق', 'صحافة', 'راديو'] },
  decorators: [rtl],
};
