import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { ReleaseSaveStatusRow } from './ReleaseSaveStatusRow';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-64'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/**
 * State coverage for the release save status row. The canonical stories stay
 * in ReleaseSaveStatusRow.stories.tsx; these show the reserved idle row, a
 * long failure message and the document direction.
 */
const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseSaveStatusRow States',
  component: ReleaseSaveStatusRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [Frame],
  args: {
    status: 'idle',
  },
} satisfies Meta<typeof ReleaseSaveStatusRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing to report, so the row only reserves its height. */
export const EmptyReservedRow: Story = {};

/** Long content: a long failure message and retry label wrap inline. */
export const LongContentFailure: Story = {
  args: {
    status: 'error',
    feedback: {
      message:
        "Couldn't save changes because the release was edited in another tab and the server rejected this older copy of the title, label and ISRC.",
      actionLabel: 'Retry saving every changed field',
      onRetry: fn(),
    },
  },
};

/** Right-to-left: an Arabic failure message and retry inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    status: 'error',
    feedback: {
      message: 'تعذر حفظ التغييرات.',
      actionLabel: 'إعادة المحاولة',
      onRetry: fn(),
    },
  },
  decorators: [RtlFrame],
};
