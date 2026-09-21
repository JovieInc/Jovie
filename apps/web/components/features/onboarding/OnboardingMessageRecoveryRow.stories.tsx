import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OnboardingMessageRecoveryRow } from './OnboardingMessageRecoveryRow';

const meta = {
  title: 'Features/Onboarding/Message Recovery Row',
  component: OnboardingMessageRecoveryRow,
  parameters: {
    layout: 'centered',
    jovie: {
      // `disabled` is an internal button attribute (disabled={isBusy || isSubmitted}),
      // not a component prop — covered by the Busy/Submitted state stories.
      uncoveredProps: ['disabled'],
    },
  },
} satisfies Meta<typeof OnboardingMessageRecoveryRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RateLimited: Story = {
  args: {
    chatError: {
      type: 'rate_limit',
      message:
        'Too many anonymous chat requests from this IP. Please sign up to continue.',
      retryAfter: 45,
    },
    handleRetry: () => {},
    isBusy: false,
    isSubmitted: false,
  },
};

export const RetryableServer: Story = {
  args: {
    chatError: {
      type: 'server',
      message: 'Something went wrong while sending your message.',
      failedMessage: 'hello',
    },
    handleRetry: () => {},
    isBusy: false,
    isSubmitted: false,
  },
};

export const Busy: Story = {
  args: {
    chatError: {
      type: 'server',
      message: 'Something went wrong while sending your message.',
      failedMessage: 'hello',
    },
    handleRetry: () => {},
    isBusy: true,
    isSubmitted: false,
  },
};

export const Submitted: Story = {
  args: {
    chatError: {
      type: 'server',
      message: 'Something went wrong while sending your message.',
      failedMessage: 'hello',
    },
    handleRetry: () => {},
    isBusy: false,
    isSubmitted: true,
  },
};
