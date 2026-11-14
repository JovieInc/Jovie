import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ErrorDetails } from './ErrorDetails';

/**
 * Rendered states of the shared error details block. The default render
 * lives in ErrorDetails.stories.tsx.
 */
const meta = {
  title: 'Features/Feedback/ErrorDetails/States',
  component: ErrorDetails,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ErrorDetails>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no error object, so only a generated reference and the time show. */
export const EmptyNoError: Story = {};

/** Error: a server error with its digest as the error ID. */
export const ErrorWithDigest: Story = {
  args: {
    error: Object.assign(new Error('Failed to fetch release data'), {
      digest: 'release-fetch-503',
    }),
    extraContext: { Route: '/app/releases' },
  },
};

/** Partial: the collapsed recovery view without the raw message. */
export const PartialCollapsed: Story = {
  args: {
    error: new Error('Request timed out'),
    collapsible: true,
  },
};

/** Long content: a long error message in the expanded diagnostic view. */
export const LongContentMessage: Story = {
  args: {
    error: Object.assign(
      new Error(
        'Failed to sync the release plan for Skyline Dreams because the distributor returned an unexpected response while the playlist pitch, fan SMS schedule and every provider link were being refreshed'
      ),
      { digest: 'release-sync-long-message-0042' }
    ),
    collapsible: true,
    showMessage: true,
  },
  decorators: [
    function NarrowColumn(StoryComponent) {
      return (
        <div className='w-80'>
          <StoryComponent />
        </div>
      );
    },
  ],
};

/** Right-to-left: an Arabic error message in an Arabic document direction. */
export const RtlArabicMessage: Story = {
  args: {
    error: new Error('تعذر تحميل بيانات الإصدار'),
    collapsible: true,
    showMessage: true,
  },
  decorators: [
    function RtlDirection(StoryComponent) {
      return (
        <div dir='rtl' lang='ar'>
          <StoryComponent />
        </div>
      );
    },
  ],
};
