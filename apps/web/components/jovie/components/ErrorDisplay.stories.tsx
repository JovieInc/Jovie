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
