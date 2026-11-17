import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, fn, within } from 'storybook/test';
import { ReleaseActionErrorCard } from './ReleaseActionErrorCard';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-80'>
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
 * State coverage for the release action error card. The canonical stories
 * stay in ReleaseActionErrorCard.stories.tsx; these change which optional
 * parts are present, the copy length and the document direction.
 */
const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseActionErrorCard States',
  component: ReleaseActionErrorCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [Frame],
  args: {
    message:
      "Couldn't publish this release. Check your connection and try again.",
    actionLabel: 'Retry',
    onRetry: fn(),
  },
} satisfies Meta<typeof ReleaseActionErrorCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: inline, with no title and no dismiss action, only the retry. */
export const PartialInlineRetryOnly: Story = {
  args: { variant: 'inline' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('button')).toHaveLength(1);
  },
};

/** Long content: a long title, message and action label wrap in the card. */
export const LongContentMessage: Story = {
  args: {
    title: 'Publishing to every connected store failed for this release',
    message:
      "Couldn't publish this release because three of the connected distributors rejected the artwork dimensions and the fourth timed out before it answered. Check the artwork and your connection, then try again.",
    actionLabel: 'Retry publishing to all stores',
    onDismiss: fn(),
  },
};

/** Right-to-left: the card inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    title: 'فشل النشر',
    message: 'تعذر نشر هذا الإصدار. تحقق من اتصالك وحاول مرة أخرى.',
    actionLabel: 'إعادة المحاولة',
    onDismiss: fn(),
  },
  decorators: [RtlFrame],
};
