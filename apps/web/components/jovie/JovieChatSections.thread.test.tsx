import type { Virtualizer } from '@tanstack/react-virtual';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatThreadMessages } from './JovieChatSections';

vi.mock('@/components/jovie/components', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/jovie/components')>()),
  ChatMessage: ({ id }: { id: string }) => (
    <div data-testid='thread-row'>{id}</div>
  ),
}));

function renderThreadMessages({
  collapsedFailureCount = 0,
  onShowCollapsedFailures,
}: {
  readonly collapsedFailureCount?: number;
  readonly onShowCollapsedFailures?: () => void;
} = {}) {
  return render(
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
      inlineChatError={null}
      isStuckToBottom
      onScrollToBottom={() => undefined}
      collapsedFailureCount={collapsedFailureCount}
      onShowCollapsedFailures={onShowCollapsedFailures}
    />
  );
}

describe('ChatThreadMessages collapsed summer failures', () => {
  it('hides the control when there are no collapsed failures', () => {
    renderThreadMessages({
      collapsedFailureCount: 0,
      onShowCollapsedFailures: vi.fn(),
    });

    expect(screen.getByTestId('chat-thread-empty')).toHaveTextContent(
      'Nothing in this thread yet.'
    );

    expect(
      screen.queryByTestId('chat-collapsed-failures')
    ).not.toBeInTheDocument();
  });

  it('uses singular copy for one earlier unanswered message and reveals it on click', () => {
    const onShowCollapsedFailures = vi.fn();
    renderThreadMessages({ collapsedFailureCount: 1, onShowCollapsedFailures });

    const control = screen.getByTestId('chat-collapsed-failures');
    expect(control).toHaveTextContent(
      '1 earlier message went unanswered. Show it'
    );

    fireEvent.click(control);
    expect(onShowCollapsedFailures).toHaveBeenCalledTimes(1);
  });

  it('uses plural copy for multiple earlier unanswered messages', () => {
    renderThreadMessages({
      collapsedFailureCount: 3,
      onShowCollapsedFailures: vi.fn(),
    });

    expect(screen.getByTestId('chat-collapsed-failures')).toHaveTextContent(
      '3 earlier messages went unanswered. Show them'
    );
  });
});

describe('ChatThreadMessages profile follow-ups', () => {
  const thread = (firstText: string) => [
    {
      id: 'u1',
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: firstText }],
    },
    {
      id: 'a1',
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: 'Your profile pulled 40 views.' }],
    },
  ];
  const renderProfileThread = (
    firstText: string,
    onFollowUp: (prompt: string) => void
  ) =>
    render(
      <ChatThreadMessages
        messages={thread(firstText)}
        shouldVirtualizeMessages={false}
        virtualizer={{} as Virtualizer<HTMLDivElement, Element>}
        virtualizedMessageViewportHeight={0}
        virtualizedMinHeight={0}
        messageViewportPaddingBottom={undefined}
        totalSizeRef={() => undefined}
        bottomSentinelRef={() => undefined}
        isStreaming={false}
        lastAssistantIndex={1}
        profileId='profile-own'
        knownMessageIds={new Set(['u1', 'a1'])}
        inlineChatError={null}
        isStuckToBottom
        onScrollToBottom={() => undefined}
        onFollowUp={onFollowUp}
      />
    );

  it('shows next moves after the first reply to the profile chip and sends a tap', () => {
    const onFollowUp = vi.fn();
    renderProfileThread('@profile:profile-own[Tim White]', onFollowUp);

    fireEvent.click(screen.getByRole('button', { name: 'Grow My Audience' }));
    expect(onFollowUp).toHaveBeenCalledWith('How do I grow my audience?');
  });

  it('shows no next moves when the chat opened with a question', () => {
    renderProfileThread('What should I post this week?', vi.fn());
    expect(screen.queryByTestId('chat-follow-ups')).not.toBeInTheDocument();
  });
});
