import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ErrorDialog } from './ErrorDialog';

const meta = {
  title: 'Feedback/ErrorDialog/States',
  component: ErrorDialog,
  parameters: { layout: 'centered' },
  args: {
    open: true,
    title: 'Failed to save changes',
    description: 'An error occurred while saving your profile.',
    onClose: fn(),
  },
} satisfies Meta<typeof ErrorDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no custom action labels, so only the default Retry action shows. */
export const EmptyDefaultActions: Story = {};

/** Error: the thrown error and its digest show in the details block. */
export const ErrorWithDigest: Story = {
  args: {
    error: Object.assign(new Error('Upstream request failed'), {
      digest: 'abc123',
    }),
  },
};

/** Partial: only a secondary action label with no primary label. */
export const PartialSecondaryOnly: Story = {
  args: { secondaryActionLabel: 'Dismiss', onSecondaryAction: fn() },
};

/** Long content: a title and description far past one line. */
export const LongContentCopy: Story = {
  args: {
    title:
      'We could not save your changes to the release because the connection was interrupted twice in a row',
    description:
      'An error occurred while saving your release, its credits, its artwork and every platform link attached to it, so none of your edits were stored.',
    primaryActionLabel: 'Retry saving every change again',
    secondaryActionLabel: 'Dismiss and keep editing',
  },
};

/** Rtl: the dialog inside a right-to-left container. */
export const RtlDialog: Story = {
  args: {
    title: 'تعذر حفظ التغييرات',
    description: 'حدث خطأ أثناء حفظ ملفك الشخصي.',
    primaryActionLabel: 'إعادة المحاولة',
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
