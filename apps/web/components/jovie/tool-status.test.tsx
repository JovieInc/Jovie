import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toolEventToMessagePart } from '@/lib/chat/tool-events';
import { TOOL_STATUS_EVENT, TOOL_STATUS_PARTS } from './fixtures/tool-status';
import { hydratePersistedMessageParts } from './message-parts';
import {
  createInitialChatTimelineState,
  reduceChatTimeline,
  selectRenderableMessages,
} from './timeline/chat-timeline';
import { ToolPartsRenderer } from './tool-ui';
import type { MessagePart } from './types';

vi.mock('@/components/molecules/UpgradeButton', () => ({
  UpgradeButton: () => null,
}));

function checks(container: HTMLElement) {
  return container.querySelectorAll('[data-fill="check"]');
}

function row() {
  return screen.getByTestId('tool-status-row');
}

describe('truthful chat operation status', () => {
  it('shows one check only after persistence, keeping one accessible owner', () => {
    const { container, rerender } = render(
      <ToolPartsRenderer
        variant='chat'
        isStreaming
        parts={TOOL_STATUS_PARTS.working}
      />
    );
    const owner = screen.getByRole('status');
    expect(row()).toHaveAttribute('data-operation-status', 'working');
    expect(checks(container)).toHaveLength(0);
    rerender(
      <ToolPartsRenderer
        variant='chat'
        isStreaming
        parts={TOOL_STATUS_PARTS.unconfirmed}
      />
    );
    expect(row()).toHaveAttribute('data-operation-status', 'pending');
    expect(checks(container)).toHaveLength(0);
    rerender(
      <ToolPartsRenderer variant='chat' parts={TOOL_STATUS_PARTS.unconfirmed} />
    );
    expect(row()).toHaveAttribute('data-operation-status', 'unknown');
    expect(checks(container)).toHaveLength(0);
    rerender(
      <ToolPartsRenderer variant='chat' parts={TOOL_STATUS_PARTS.succeeded} />
    );
    expect(checks(container)).toHaveLength(1);
    expect(screen.getAllByRole('status')).toEqual([owner]);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('receives the saved receipt through the real timeline refetch without replacing the row', () => {
    let state = reduceChatTimeline(createInitialChatTimelineState(), {
      type: 'message.send.started',
      conversationId: 'conversation',
      clientTurnId: 'turn',
      parts: [{ type: 'text', text: 'Inspect source' }],
      now: 100,
    });
    state = reduceChatTimeline(state, {
      type: 'assistant.stream.completed',
      conversationId: 'conversation',
      clientTurnId: 'turn',
      parts: [...TOOL_STATUS_PARTS.unconfirmed],
      now: 200,
    });
    const assistant = () =>
      selectRenderableMessages(state).find(
        message => message.role === 'assistant'
      );
    const id = assistant()?.id;
    const { container, rerender } = render(
      <ToolPartsRenderer variant='chat' parts={assistant()?.parts ?? []} />
    );
    expect(checks(container)).toHaveLength(0);
    state = reduceChatTimeline(state, {
      type: 'conversation.refetch.succeeded',
      conversationId: 'conversation',
      receivedAt: 300,
      messages: [
        {
          id: 'saved-message',
          role: 'assistant',
          clientMessageId: 'assistant:turn',
          parts: [...TOOL_STATUS_PARTS.succeeded],
          createdAt: new Date(250),
        },
      ],
    });
    expect(assistant()?.id).toBe(id);
    rerender(
      <ToolPartsRenderer variant='chat' parts={assistant()?.parts ?? []} />
    );
    expect(checks(container)).toHaveLength(1);
  });

  it('offers no retry for a non-retryable failure', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          toolEventToMessagePart({
            ...TOOL_STATUS_EVENT,
            state: 'failed',
            output: {
              success: false,
              retryable: false,
              error: 'Source permission denied',
            },
          }),
        ]}
      />
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(/retry|try again/i);
  });

  it('rejects fake completion and stale receipts from another call', () => {
    const fake = {
      ...TOOL_STATUS_PARTS.unconfirmed[0],
      persistedToolReceipt: {
        operationKey: 'old-attempt',
        state: 'succeeded',
        persisted: true,
      },
    } as const;
    const { container } = render(
      <ToolPartsRenderer variant='chat' parts={[fake]} />
    );
    expect(checks(container)).toHaveLength(0);
    expect(row()).toHaveAttribute('data-operation-status', 'unknown');
  });

  it('clears an old receipt when the latest part for the call is live', () => {
    const { container } = render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          ...TOOL_STATUS_PARTS.succeeded,
          ...TOOL_STATUS_PARTS.unconfirmed,
        ]}
      />
    );
    expect(checks(container)).toHaveLength(0);
    expect(screen.getAllByTestId('tool-status-row')).toHaveLength(1);
  });

  it('stops on an interrupted task and never turns stream end into success', () => {
    const { container, rerender } = render(
      <ToolPartsRenderer
        variant='chat'
        isStreaming
        parts={TOOL_STATUS_PARTS.working}
      />
    );
    rerender(
      <ToolPartsRenderer variant='chat' parts={TOOL_STATUS_PARTS.working} />
    );
    expect(row()).toHaveAttribute('data-operation-status', 'unknown');
    expect(container.querySelector('[data-fill="indeterminate"]')).toBeNull();
    expect(checks(container)).toHaveLength(0);
  });

  it.each(['pending', 'failed', 'cancelled'] as const)(
    'renders %s without a check or fabricated retry button',
    state => {
      const { container } = render(
        <ToolPartsRenderer variant='chat' parts={TOOL_STATUS_PARTS[state]} />
      );
      expect(row()).toHaveAttribute('data-operation-status', state);
      expect(checks(container)).toHaveLength(0);
      expect(
        screen.queryByRole('button', { name: /retry|try again/i })
      ).not.toBeInTheDocument();
    }
  );

  it('keeps a failed tool in a partially successful batch failed', () => {
    const failed = {
      ...TOOL_STATUS_EVENT,
      toolCallId: 'press-source:attempt-2',
      state: 'failed' as const,
      output: { success: false, error: 'Source unavailable' },
    };
    const { container } = render(
      <ToolPartsRenderer
        variant='chat'
        parts={hydratePersistedMessageParts('', [TOOL_STATUS_EVENT, failed])}
      />
    );
    expect(checks(container)).toHaveLength(1);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(
      screen
        .getAllByTestId('tool-status-row')
        .map(el => el.dataset.operationStatus)
    ).toEqual(['succeeded', 'failed']);
  });

  it('replays idempotently and handles rapid successive attempts independently', () => {
    const { container, rerender } = render(
      <ToolPartsRenderer
        variant='chat'
        parts={hydratePersistedMessageParts('', [
          TOOL_STATUS_EVENT,
          TOOL_STATUS_EVENT,
        ])}
      />
    );
    expect(checks(container)).toHaveLength(1);
    const next = toolEventToMessagePart({
      ...TOOL_STATUS_EVENT,
      toolCallId: 'press-source:attempt-2',
      state: 'running',
    });
    rerender(
      <ToolPartsRenderer
        variant='chat'
        isStreaming
        parts={[...TOOL_STATUS_PARTS.succeeded, next]}
      />
    );
    expect(checks(container)).toHaveLength(1);
    expect(
      screen
        .getAllByTestId('tool-status-row')
        .map(el => el.dataset.operationStatus)
    ).toEqual(['succeeded', 'working']);
  });

  it('does not invent success for unknown or malformed SDK states', () => {
    const parts = [
      { ...TOOL_STATUS_PARTS.unconfirmed[0], state: 'stream-ended' },
    ] as unknown as MessagePart[];
    const { container } = render(
      <ToolPartsRenderer variant='chat' parts={parts} />
    );
    expect(checks(container)).toHaveLength(0);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
