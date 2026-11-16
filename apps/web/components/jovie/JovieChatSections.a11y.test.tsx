import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Virtualizer } from '@tanstack/react-virtual';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { PendingFile } from './hooks/useChatFileAttachments';
import {
  ChatComposerSurface,
  ChatEmptyStateComposerRegion,
  ChatInlineError,
  ChatLoadingConversationSkeleton,
  ChatThreadMessages,
} from './JovieChatSections';
import type { ChatError } from './types';

vi.mock('@/components/jovie/components/ChatUsageAlert', () => ({
  ChatUsageAlert: () => null,
}));

const serverError: ChatError = {
  type: 'server',
  message: 'We encountered a temporary issue. Please try again.',
  failedMessage: 'What matters now?',
};

function Thread({
  collapsedFailureCount = 0,
  onShowCollapsedFailures,
  inlineChatError = null,
}: {
  readonly collapsedFailureCount?: number;
  readonly onShowCollapsedFailures?: () => void;
  readonly inlineChatError?: ReactNode;
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
      inlineChatError={inlineChatError}
      isStuckToBottom
      onScrollToBottom={() => undefined}
      collapsedFailureCount={collapsedFailureCount}
      onShowCollapsedFailures={onShowCollapsedFailures}
    />
  );
}

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

describe('JovieChatSections accessibility', () => {
  it('shows the upload pay gate for files over the plan quota', async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <TooltipProvider>
          <ChatComposerSurface
            chatInputProps={{
              value: 'Make cover art',
              onChange: vi.fn(),
              onSubmit: vi.fn(),
              isLoading: false,
              isSubmitting: false,
            }}
            showThreadView
            suppressUsageAlert
            isRateLimited
            showManifest
            manifestCollapsed={false}
            showChips={false}
            pendingFiles={[lockedFile('cover-a'), lockedFile('cover-b')]}
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
            onRemoveFile={vi.fn()}
            onCollapseManifest={vi.fn()}
            onExpandManifest={vi.fn()}
          />
        </TooltipProvider>
      </QueryClientProvider>
    );

    expect(screen.getByText('2 files locked')).toBeInTheDocument();
    expect(screen.getByText(/Sending too fast/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in the empty Just ask region', async () => {
    const { container } = render(
      <ChatEmptyStateComposerRegion stableDocked showDockedWelcome>
        <textarea aria-label='Message' />
      </ChatEmptyStateComposerRegion>
    );
    expect(screen.getByTestId('chat-empty-state-greeting')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in the conversation loading skeleton', async () => {
    const { container } = render(<ChatLoadingConversationSkeleton />);
    await expectNoA11yViolations(container);
  });

  it.each([
    ['a server error', serverError, undefined],
    [
      'an offline send',
      {
        type: 'network',
        message: 'Check your connection and try again.',
        failedMessage: 'What matters now?',
      } satisfies ChatError,
      undefined,
    ],
    ['an operator error', serverError, 'ov' as const],
  ])(
    'retries %s from the inline alert',
    async (_label, chatError, chatMode) => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      const { container } = render(
        <ChatInlineError
          chatError={chatError}
          onRetry={onRetry}
          isLoading={false}
          isSubmitting={false}
          chatMode={chatMode}
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /retry/i }));
      expect(onRetry).toHaveBeenCalledOnce();
      await expectNoA11yViolations(container);
    }
  );

  it('reveals collapsed failures in a thread with an inline error', async () => {
    const user = userEvent.setup();
    const onShow = vi.fn();
    const { container } = render(
      <Thread
        collapsedFailureCount={3}
        onShowCollapsedFailures={onShow}
        inlineChatError={
          <ChatInlineError
            chatError={serverError}
            onRetry={vi.fn()}
            isLoading={false}
            isSubmitting={false}
          />
        }
      />
    );

    await user.click(screen.getByRole('button', { name: /3 earlier/i }));
    expect(onShow).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in a right-to-left empty region', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatEmptyStateComposerRegion stableDocked showDockedWelcome>
          <textarea aria-label='رسالة' />
        </ChatEmptyStateComposerRegion>
      </div>
    );
    expect(screen.getByRole('textbox', { name: 'رسالة' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
