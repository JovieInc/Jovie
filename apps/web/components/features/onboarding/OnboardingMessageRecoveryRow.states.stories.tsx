import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ChatError } from '@/components/jovie/types';
import { OnboardingMessageRecoveryRow } from './OnboardingMessageRecoveryRow';

const NOOP = () => {};

function errorArgs(chatError: ChatError) {
  return {
    chatError,
    handleRetry: NOOP,
    isBusy: false,
    isSubmitted: false,
  } as const;
}

const meta = {
  title: 'Features/Onboarding/Message Recovery Row/States',
  component: OnboardingMessageRecoveryRow,
  parameters: { layout: 'centered' },
  decorators: [
    function WidthDecorator(Story) {
      return (
        <div className='w-80'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof OnboardingMessageRecoveryRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: an error with no failed message to resend shows no retry. */
export const EmptyNoRetry: Story = {
  args: errorArgs({ type: 'server', message: 'Something went wrong.' }),
};

/** Error: a retryable server failure with the failed message kept. */
export const ErrorRetryable: Story = {
  args: errorArgs({
    type: 'server',
    message: 'Something went wrong while sending your message.',
    failedMessage: 'hello',
  }),
};

/** Long content: a long server message wraps inside the row. */
export const LongContentMessage: Story = {
  args: errorArgs({
    type: 'server',
    message:
      'The assistant could not reach the service that builds your profile, so your last message was not delivered. Check your connection and try sending it again in a moment.',
    failedMessage: 'hello',
  }),
};

/** Permission denied: rate limited visitors are pointed to sign up. */
export const PermissionDeniedRateLimited: Story = {
  args: errorArgs({
    type: 'rate_limit',
    message: 'Too many anonymous chat requests. Please sign up to continue.',
    retryAfter: 90,
  }),
};

/** Right to left: the row under an Arabic document direction. */
export const RtlOverflow: Story = {
  args: errorArgs({
    type: 'server',
    message: 'حدث خطأ أثناء إرسال رسالتك.',
    failedMessage: 'مرحبا',
  }),
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
