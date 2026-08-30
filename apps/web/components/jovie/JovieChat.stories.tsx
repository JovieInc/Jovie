import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CHAT_EMPTY_SAMPLE_STORAGE_KEY } from './chat-empty-starters';
import { ChatEmptyStateComposerRegion } from './components/ChatEmptyStateComposerRegion';
import { JovieChat } from './JovieChat';

function StoryComposerDock() {
  return (
    <label className='system-b-chat-content-shell block rounded-2xl bg-surface-1 px-3 py-2 text-sm text-secondary-token'>
      Message
      <textarea
        className='mt-1 w-full resize-none bg-transparent text-primary-token'
        rows={2}
        placeholder='Ask anything'
        aria-label='Message'
      />
    </label>
  );
}

const meta = {
  title: 'Chat/JovieChat',
  component: JovieChat,
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['isLoading'] },
  },
  args: {
    ambientOwnedByShell: true,
  },
  decorators: [
    Story => {
      try {
        sessionStorage.removeItem(CHAT_EMPTY_SAMPLE_STORAGE_KEY);
      } catch {
        // Story extraction can run without Web Storage.
      }
      return (
        <div className='min-h-96 bg-base p-6'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof JovieChat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const JustAskEmpty: Story = {
  render: () => (
    <ChatEmptyStateComposerRegion
      stableDocked
      showDockedWelcome
      onSelectSample={fn()}
    >
      <StoryComposerDock />
    </ChatEmptyStateComposerRegion>
  ),
};
