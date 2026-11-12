import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Virtualizer } from '@tanstack/react-virtual';
import { fn } from 'storybook/test';
import { CHAT_EMPTY_SAMPLE_STORAGE_KEY } from './chat-empty-starters';
import type { PendingFile } from './hooks/useChatFileAttachments';
import {
  ChatComposerSurface,
  ChatEmptyStateComposerRegion,
  ChatInlineError,
  ChatLoadingConversationSkeleton,
  ChatThreadMessages,
} from './JovieChatSections';
import type { ChatError } from './types';

const serverError: ChatError = {
  type: 'server',
  message: 'We encountered a temporary issue. Please try again.',
  failedMessage: 'What should I release next month?',
};

const networkError: ChatError = {
  type: 'network',
  message: 'You appear to be offline. Check your connection and try again.',
  failedMessage: 'What should I release next month?',
};

const longError: ChatError = {
  type: 'server',
  message:
    'We encountered a temporary issue while drafting the rollout plan for the deluxe edition, the acoustic sessions, the remix bundle and every regional pre-save campaign. Please try again in a moment.',
  failedMessage:
    'Plan the full rollout for the deluxe edition including acoustic sessions, remix bundle, regional pre-saves and the follow-up tour announcement.',
};

function lockedFile(id: string): PendingFile {
  return {
    id,
    name: `${id}.png`,
    size: 2048,
    mediaType: 'image/png',
    kind: 'image',
    kindLabel: 'Image',
    progress: 0,
    speed: 0,
    status: 'locked',
  };
}

function StoryThread({
  collapsedFailureCount,
  chatError,
}: {
  readonly collapsedFailureCount: number;
  readonly chatError: ChatError;
}) {
  return (
    <ChatThreadMessages
      messages={[]}
      shouldVirtualizeMessages={false}
      virtualizer={{} as Virtualizer<HTMLDivElement, Element>}
      virtualizedMessageViewportHeight={0}
      virtualizedMinHeight={0}
      messageViewportPaddingBottom={undefined}
      totalSizeRef={() => undefined}
      bottomSentinelRef={() => undefined}
      isStreaming={false}
      lastAssistantIndex={-1}
      knownMessageIds={new Set()}
      inlineChatError={
        <ChatInlineError
          chatError={chatError}
          onRetry={fn()}
          isLoading={false}
          isSubmitting={false}
        />
      }
      isStuckToBottom
      onScrollToBottom={fn()}
      collapsedFailureCount={collapsedFailureCount}
      onShowCollapsedFailures={fn()}
    />
  );
}

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

export const EmptyJustAsk: Story = {
  args: {
    stableDocked: true,
    showDockedWelcome: true,
    children: <StoryComposerDock />,
    onSelectSample: fn(),
  },
};

export const PartialWithoutWelcome: Story = {
  args: {
    stableDocked: true,
    showDockedWelcome: false,
    children: <StoryComposerDock />,
    onSelectSample: fn(),
  },
};

export const ErrorInlineRetry: Story = {
  render: () => (
    <ChatInlineError
      chatError={serverError}
      onRetry={fn()}
      isLoading={false}
      isSubmitting={false}
    />
  ),
};

export const OfflineInlineRetry: Story = {
  render: () => (
    <ChatInlineError
      chatError={networkError}
      onRetry={fn()}
      isLoading={false}
      isSubmitting={false}
    />
  ),
};

export const LongContentCollapsedFailures: Story = {
  render: () => (
    <StoryThread collapsedFailureCount={12} chatError={longError} />
  ),
};

export const LockedUploadsOverQuota: Story = {
  render: () => (
    <ChatComposerSurface
      chatInputProps={{
        value: 'Make cover art for the deluxe edition',
        onChange: fn(),
        onSubmit: fn(),
        isLoading: false,
        isSubmitting: false,
      }}
      showThreadView
      suppressUsageAlert
      isRateLimited={false}
      showManifest
      manifestCollapsed={false}
      showChips={false}
      pendingFiles={[lockedFile('cover-front'), lockedFile('cover-back')]}
      aggregate={{
        total: 2,
        done: 0,
        overallPct: 0,
        speed: '',
        eta: '',
        locked: 2,
      }}
      isUploading={false}
      isPro={false}
      onRemoveFile={fn()}
      onCollapseManifest={fn()}
      onExpandManifest={fn()}
    />
  ),
};

export const RtlJustAsk: Story = {
  args: {
    stableDocked: true,
    showDockedWelcome: true,
    children: <StoryComposerDock />,
    onSelectSample: fn(),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
