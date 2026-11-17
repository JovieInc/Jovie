import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { FormStatus } from './FormStatus';

const RtlFrame: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
};

const meta: Meta<typeof FormStatus> = {
  title: 'Molecules/FormStatus States',
  component: FormStatus,
  parameters: {
    layout: 'centered',
  },
  args: {
    className: 'w-80',
  },
};

export default meta;
type Story = StoryObj<typeof FormStatus>;

/** Partial: a whitespace-only error is dropped, so only the success line shows. */
export const PartialSuccessOnly: Story = {
  args: {
    error: '   ',
    success: 'Saved. Your profile is live.',
  },
};

/** Long content: a long error wraps inside the status line. */
export const LongContentError: Story = {
  args: {
    error:
      'We could not save your changes because the release date conflicts with an existing pre-save campaign. Pick another date or end the current campaign, then try again.',
  },
};

/** Offline: the owning form reports a dropped connection through the error prop. */
export const OfflineSaveFailed: Story = {
  args: {
    error: 'You are offline. Reconnect to save your changes.',
  },
};

/** Right-to-left: an Arabic success message inside an RTL form. */
export const RtlArabicSuccess: Story = {
  args: {
    success: 'تم حفظ التغييرات بنجاح.',
  },
  decorators: [RtlFrame],
};
