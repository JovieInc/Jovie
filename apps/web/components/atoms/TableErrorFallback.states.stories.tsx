import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { TableErrorFallback } from './TableErrorFallback';

/** Rendered states of the table error fallback, beside TableErrorFallback.stories.tsx. */
const meta = {
  title: 'Atoms/TableErrorFallback States',
  component: TableErrorFallback,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    error: Object.assign(new Error('The releases table failed to load.'), {
      digest: 'releases-table-error',
    }),
    resetErrorBoundary: fn(),
  },
  decorators: [
    Story => (
      <div className='flex min-h-64 items-center justify-center rounded-md border border-subtle'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TableErrorFallback>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: a server error with a digest for the collapsed details. */
export const ErrorWithDigest: Story = {};

/** Long content: a long error message wraps inside the table frame. */
export const LongContentMessage: Story = {
  args: {
    error: Object.assign(
      new Error(
        'The releases table could not be loaded because the catalog service returned an incomplete response for several territories and distributors.'
      ),
      { digest: 'releases-table-long' }
    ),
  },
};

/** Offline: the browser dropped the request, so fetch threw a network error. */
export const OfflineFetchFailed: Story = {
  args: {
    error: new TypeError('Failed to fetch'),
  },
};

/** Right-to-left: an Arabic error message on a right-to-left page. */
export const RtlArabicMessage: Story = {
  args: {
    error: new Error('تعذر تحميل جدول الإصدارات.'),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
