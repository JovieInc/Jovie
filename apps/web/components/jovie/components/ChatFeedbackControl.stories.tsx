import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ChatFeedbackControl } from './ChatFeedbackControl';

/**
 * Votes post to /api/chat/feedback. Stories answer that one route from a
 * fixture so a click never leaves the browser.
 */
function stubFeedbackRoute(status: number) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    if (String(input).includes('/api/chat/feedback')) {
      return new Response(JSON.stringify({ ok: status < 400 }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error('Unexpected network request in ChatFeedbackControl story.');
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const meta = {
  title: 'Jovie/Components/ChatFeedbackControl',
  component: ChatFeedbackControl,
  parameters: { layout: 'centered' },
  args: {
    messageId: 'story-message-1',
    conversationId: 'story-conversation-1',
    excerpt: 'Here is the next step for your release.',
  },
} satisfies Meta<typeof ChatFeedbackControl>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No vote cast yet: both thumbs are neutral and unpressed. */
export const EmptyNoVote: Story = {};

/** A recorded vote fills the thumb and marks it pressed. */
export const VotedUp: Story = {
  beforeEach: () => stubFeedbackRoute(200),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const up = canvas.getByRole('button', { name: 'Good response' });
    await userEvent.click(up);
    await expect(up).toHaveAttribute('aria-pressed', 'true');
  },
};

/** The server refused the vote: the optimistic fill rolls back to neutral. */
export const ErrorVoteRolledBack: Story = {
  beforeEach: () => stubFeedbackRoute(503),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const down = canvas.getByRole('button', { name: 'Bad response' });
    await userEvent.click(down);
    await waitFor(() => expect(down).toHaveAttribute('aria-pressed', 'false'));
  },
};

/** In a right-to-left transcript the pair mirrors with the message row. */
export const RtlLayout: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='flex items-center gap-2'>
        <span className='text-xs text-secondary-token'>هل كان هذا مفيدًا؟</span>
        <Story />
      </div>
    ),
  ],
};
