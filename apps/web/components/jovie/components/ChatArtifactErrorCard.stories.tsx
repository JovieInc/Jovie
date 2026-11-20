import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ChatArtifactErrorCard } from './ChatArtifactErrorCard';

const meta = {
  title: 'Jovie/ChatArtifactErrorCard',
  component: ChatArtifactErrorCard,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-80 bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    title: "Couldn't generate cover art",
    message: 'Something went wrong on our end.',
  },
} satisfies Meta<typeof ChatArtifactErrorCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutRetry: Story = {
  args: {
    showRetry: false,
  },
};

export const CustomRetryPrompt: Story = {
  args: {
    retryPrompt: 'Try generating the cover art again',
  },
};

/**
 * Error: a failed artifact tool with a recoverable failure. Try again
 * resubmits the retry prompt through the chat's submit event.
 */
export const ErrorRecoverableRetry: Story = {
  args: {
    title: 'Album Art Failed',
    message:
      'Jovie could not finish this action. Retry or ask for a simpler next step.',
    retryPrompt: 'Please retry album art.',
  },
  play: async ({ canvasElement }) => {
    const onPrompt = fn();
    const listener = (event: Event) =>
      onPrompt((event as CustomEvent<{ prompt: string }>).detail.prompt);
    globalThis.addEventListener('jovie-chat-submit-prompt', listener);
    try {
      const canvas = within(canvasElement);
      await userEvent.click(canvas.getByRole('button', { name: 'Try again' }));
      await expect(onPrompt).toHaveBeenCalledWith('Please retry album art.');
    } finally {
      globalThis.removeEventListener('jovie-chat-submit-prompt', listener);
    }
  },
};

/** Partial: the title alone when the failure carried no message. */
export const PartialTitleOnly: Story = {
  args: {
    title: 'Presence task failed',
    message: undefined,
    showRetry: false,
  },
};

/** Long content: a long tool title and a two-sentence recovery message wrap. */
export const LongContentMessage: Story = {
  args: {
    title:
      "Couldn't generate the release pitch for Midnight Drive (Deluxe Anniversary Edition)",
    message:
      'The service behind this action is temporarily unavailable while we refresh your connected catalogue and streaming sources. Retry in a few minutes or ask Jovie for an alternate approach.',
  },
};

/** Right-to-left: an Arabic failure card inside an RTL transcript. */
export const RtlArabicError: Story = {
  args: {
    title: 'تعذر إنشاء صورة الغلاف',
    message: 'حدث خطأ من جانبنا. حاول مرة أخرى بعد قليل.',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
