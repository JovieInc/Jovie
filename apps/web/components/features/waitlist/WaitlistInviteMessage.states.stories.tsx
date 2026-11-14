import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { WaitlistInviteMessage } from './WaitlistInviteMessage';

/**
 * Rendered states of the waitlist invite recovery message. These make no Pen
 * claim; the source-backed Pen stories live in WaitlistInviteMessage.stories.tsx.
 */
function withRtl(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Marketing/Routes/WaitlistInvite States',
  component: WaitlistInviteMessage,
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
  },
} satisfies Meta<typeof WaitlistInviteMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long title and body wrap inside the column. */
export const LongContentCopy: Story = {
  args: {
    title:
      'This invite link has expired, was already used, or belongs to a different account',
    body: 'Invite links stay valid for a limited time and work once, for the verified email address that received them. Open the most recent invite email from Jovie, sign in with that same address, and open the link again. If the newest link still does not work, check your waitlist status for a fresh invite.',
  },
};

/** RTL: Arabic recovery copy in a right-to-left document. */
export const RtlArabic: Story = {
  args: {
    title: 'رابط الدعوة مفقود',
    body: 'رابط الدعوة هذا ينقصه الرمز الآمن. افتح أحدث رسالة دعوة وحاول مرة أخرى.',
  },
  decorators: [withRtl],
};
