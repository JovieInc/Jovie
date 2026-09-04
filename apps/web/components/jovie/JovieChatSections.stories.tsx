import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { CHAT_EMPTY_SAMPLE_STORAGE_KEY } from './chat-empty-starters';
import {
  ChatEmptyStateComposerRegion,
  ChatLoadingConversationSkeleton,
} from './JovieChatSections';

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
  title: 'Chat/JovieChatSections',
  component: ChatEmptyStateComposerRegion,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: [
        'chatInputProps',
        'showThreadView',
        'isRateLimited',
        'showManifest',
        'manifestCollapsed',
        'showChips',
        'pendingFiles',
        'aggregate',
        'total',
        'done',
        'overallPct',
        'speed',
        'eta',
        'locked',
        'isUploading',
        'isPro',
        'onRemoveFile',
        'onCollapseManifest',
        'onExpandManifest',
        'chatError',
        'onRetry',
        'isLoading',
        'isSubmitting',
        'messages',
        'shouldVirtualizeMessages',
        'virtualizer',
        'virtualizedMessageViewportHeight',
        'virtualizedMinHeight',
        'messageViewportPaddingBottom',
        'totalSizeRef',
        'bottomSentinelRef',
        'isStreaming',
        'lastAssistantIndex',
        'knownMessageIds',
        'inlineChatError',
        'isStuckToBottom',
        'onScrollToBottom',
      ],
    },
  },
  args: {
    children: <StoryComposerDock />,
    onSelectSample: fn(),
  },
  decorators: [
    Story => {
      try {
        sessionStorage.removeItem(CHAT_EMPTY_SAMPLE_STORAGE_KEY);
      } catch {
        // Story extraction can run without Web Storage.
      }
      return (
        <div className='flex min-h-96 justify-center bg-base p-6'>
          <div className='w-full max-w-xl'>
            <Story />
          </div>
        </div>
      );
    },
  ],
} satisfies Meta<typeof ChatEmptyStateComposerRegion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const JustAskEmpty: Story = {
  args: {
    stableDocked: true,
    showDockedWelcome: true,
    children: <StoryComposerDock />,
    onSelectSample: fn(),
  },
};

export const LoadingSkeleton: Story = {
  render: () => <ChatLoadingConversationSkeleton />,
};
