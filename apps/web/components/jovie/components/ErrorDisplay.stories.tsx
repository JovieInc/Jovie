import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { ChatError } from '../types';
import { ErrorDisplay } from './ErrorDisplay';

const serverError: ChatError = {
  type: 'server',
  message: 'The model timed out.',
  errorCode: 'CHAT_TIMEOUT',
  requestId: 'req_123',
  failedMessage: 'Retry this',
};

const meta = {
  title: 'Jovie/Components/ErrorDisplay',
  component: ErrorDisplay,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  decorators: [
    Story => (
      <div className='w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
  args: {
    chatError: serverError,
    onRetry: fn(),
    isLoading: false,
    isSubmitting: false,
  },
} satisfies Meta<typeof ErrorDisplay>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MessagePaused: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('CHAT_TIMEOUT · req_123')
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole('button', { name: 'Retry Message' })
    );
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};

export const NetworkOffline: Story = {
  args: {
    chatError: {
      type: 'network',
      message: 'You appear to be offline.',
      failedMessage: 'Check your connection',
    },
  },
};

export const ToolScopedFailure: Story = {
  args: {
    chatError: {
      type: 'tool',
      message: 'Retouch is not provisioned for this account.',
      errorCode: 'TOOL_UNPROVISIONED',
      suppressComposerPause: true,
    },
  },
};

export const OperatorPresentation: Story = {
  args: {
    presentation: 'operator',
    chatError: {
      type: 'server',
      message: 'We encountered a temporary issue. Please try again.',
      failedMessage: 'What matters now?',
    },
  },
};

export const Retrying: Story = {
  args: { isLoading: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Retry Message' })
    ).toBeDisabled();
  },
};

export const LoadingRetry: Story = {
  args: { isSubmitting: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Retry Message' })
    ).toBeDisabled();
  },
};

/** A rate limit holds the resend back until its countdown clears. */
export const ErrorRateLimited: Story = {
  args: {
    chatError: {
      type: 'rate_limit',
      message: 'You have sent a lot of messages in a short time.',
      retryAfter: 30,
      failedMessage: 'One more question',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Wait a moment, then try again'
    );
    await expect(
      canvas.queryByRole('button', { name: 'Retry Message' })
    ).toBeNull();
  },
};

export const LongContentFailure: Story = {
  args: {
    chatError: {
      type: 'unknown',
      message:
        'The reply could not finish because the upstream model returned an incomplete stream after a long tool run that touched several catalog records, a release plan and the tour calendar.',
      errorCode: 'CHAT_STREAM_INCOMPLETE_AFTER_TOOL_RUN',
      requestId: 'req_0123456789abcdef0123456789abcdef',
      failedMessage: 'Plan the release',
    },
  },
};

export const OfflineNoReference: Story = {
  args: {
    chatError: {
      type: 'network',
      message: 'You appear to be offline.',
      failedMessage: 'Check your connection',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Check your connection and try again'
    );
    await expect(canvas.queryByText('Reference')).toBeNull();
  },
};

/** The account is not provisioned for the tool: no resend, a reference only. */
export const PermissionDeniedTool: Story = {
  args: {
    chatError: {
      type: 'tool',
      message: 'Retouch is not provisioned for this account.',
      errorCode: 'TOOL_UNPROVISIONED',
      suppressComposerPause: true,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'Action could not finish'
    );
    await expect(
      canvas.queryByRole('button', { name: 'Retry Message' })
    ).toBeNull();
  },
};

export const RtlMessagePaused: Story = {
  args: {
    chatError: {
      type: 'server',
      message: 'انتهت مهلة النموذج قبل أن يكتمل الرد. حاول مرة أخرى بعد قليل.',
      errorCode: 'CHAT_TIMEOUT',
      requestId: 'req_123',
      failedMessage: 'أعد المحاولة',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
