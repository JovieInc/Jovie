import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { OnboardingMessageRecoveryRow } from './OnboardingMessageRecoveryRow';

const meta = {
  title: 'Features/Onboarding/Message Recovery Row/States',
  component: OnboardingMessageRecoveryRow,
  parameters: { layout: 'centered' },
  args: { handleRetry: fn(), isBusy: false, isSubmitted: false },
  decorators: [
    function WidthFrame(Story) {
      return (
        <div className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof OnboardingMessageRecoveryRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: an error with no message text and nothing to retry. */
export const EmptyMessage: Story = {
  args: { chatError: { type: 'server', message: '' } },
};

/** Error: a retryable server failure with the failed message kept. */
export const ErrorRetryableServer: Story = {
  args: {
    chatError: {
      type: 'server',
      message: 'Something went wrong while sending your message.',
      failedMessage: 'hello',
    },
  },
};

/** Long content: a message that wraps over many lines. */
export const LongContentMessage: Story = {
  args: {
    chatError: {
      type: 'server',
      message:
        'Something went wrong while sending your message, and we could not reach the service after several attempts, so please check your connection and try sending it again in a moment.',
      failedMessage: 'hello',
    },
  },
};

/** Permission denied: the anonymous limit is hit and an account is needed. */
export const PermissionDeniedRateLimited: Story = {
  args: {
    chatError: {
      type: 'rate_limit',
      message: 'Please sign up to continue.',
      retryAfter: 45,
    },
  },
};

/** Rtl: an Arabic message inside a right-to-left container. */
export const RtlMessage: Story = {
  args: {
    chatError: {
      type: 'server',
      message: 'حدث خطأ أثناء إرسال رسالتك.',
      failedMessage: 'hello',
    },
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
