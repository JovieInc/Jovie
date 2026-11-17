import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ContentChartState } from './ContentChartState';

/** Rendered states of the chart empty and error frame, beside ContentChartState.stories.tsx. */
const meta = {
  title: 'Molecules/ContentChartState States',
  component: ContentChartState,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-2xl text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    state: 'empty',
    title: 'No usage data',
    message: 'No usage data available yet.',
    heightClassName: 'h-64',
  },
} satisfies Meta<typeof ContentChartState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the chart failed to load and offers one retry action. */
export const ErrorWithRetry: Story = {
  args: {
    state: 'error',
    title: 'Chart unavailable',
    message: 'We could not load streams for this range.',
    action: (
      <Button size='sm' variant='secondary' onClick={fn()}>
        Try again
      </Button>
    ),
  },
};

/** Partial: a message with no title and no action. */
export const PartialMessageOnly: Story = {
  args: {
    title: undefined,
    message: 'Streams appear here after your first release goes live.',
  },
};

/** Long content: a long title and message in a short chart frame. */
export const LongContentMessage: Story = {
  args: {
    heightClassName: 'h-48',
    title: 'No listener data for the selected territories and services yet',
    message:
      'Listener counts arrive from each service a day or two after release. Check back once Spotify, Apple Music and YouTube have reported the first full week.',
  },
};

/** Right-to-left: an Arabic error with its action on a right-to-left page. */
export const RtlArabicError: Story = {
  args: {
    state: 'error',
    title: 'الرسم البياني غير متاح',
    message: 'تعذر تحميل بيانات الاستماع.',
    action: (
      <Button size='sm' variant='secondary' onClick={fn()}>
        حاول مرة أخرى
      </Button>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='w-full max-w-2xl text-primary-token'>
        <Story />
      </div>
    ),
  ],
};
