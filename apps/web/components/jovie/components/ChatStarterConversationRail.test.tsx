import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_STARTER_CONVERSATION_STORAGE_KEY,
  CHAT_STARTER_CONVERSATIONS,
} from '@/lib/chat/new-chat-entry-contract';
import { ChatStarterConversationRail } from './ChatStarterConversationRail';

describe('ChatStarterConversationRail', () => {
  beforeEach(() => {
    sessionStorage.removeItem(CHAT_STARTER_CONVERSATION_STORAGE_KEY);
  });

  it('selects every deterministic sample and launches its visible prompt', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ChatStarterConversationRail
        samples={CHAT_STARTER_CONVERSATIONS}
        onSelect={onSelect}
      />
    );

    for (const [index, sample] of CHAT_STARTER_CONVERSATIONS.entries()) {
      await user.click(
        screen.getByRole('button', {
          name: `Show Sample Conversation ${index + 1} Of 3: ${sample.userPrompt}`,
        })
      );
      await user.click(
        screen.getByRole('button', {
          name: `Start conversation: ${sample.userPrompt}`,
        })
      );
      expect(onSelect).toHaveBeenLastCalledWith(sample);
    }
  });

  it('rotates the initial sample deterministically across mounts', () => {
    const first = render(
      <ChatStarterConversationRail
        samples={CHAT_STARTER_CONVERSATIONS}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.getByRole('group', {
        name: `1 of 3: ${CHAT_STARTER_CONVERSATIONS[0].userPrompt}`,
      })
    ).toBeInTheDocument();
    first.unmount();

    render(
      <ChatStarterConversationRail
        samples={CHAT_STARTER_CONVERSATIONS}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.getByRole('group', {
        name: `2 of 3: ${CHAT_STARTER_CONVERSATIONS[1].userPrompt}`,
      })
    ).toBeInTheDocument();
  });

  it('supports arrow, Home, and End selection without auto-advance', () => {
    render(
      <ChatStarterConversationRail
        samples={CHAT_STARTER_CONVERSATIONS}
        onSelect={vi.fn()}
      />
    );
    const secondDot = screen.getByRole('button', {
      name: `Show Sample Conversation 2 Of 3: ${CHAT_STARTER_CONVERSATIONS[1].userPrompt}`,
    });
    fireEvent.click(secondDot);
    fireEvent.keyDown(secondDot, { key: 'Home' });
    expect(
      screen.getByRole('group', {
        name: `1 of 3: ${CHAT_STARTER_CONVERSATIONS[0].userPrompt}`,
      })
    ).toBeInTheDocument();
    fireEvent.keyDown(secondDot, { key: 'End' });
    expect(
      screen.getByRole('group', {
        name: `3 of 3: ${CHAT_STARTER_CONVERSATIONS[2].userPrompt}`,
      })
    ).toBeInTheDocument();
  });

  it('shares the canonical chat grid anchor with the composer', () => {
    render(
      <ChatStarterConversationRail
        samples={CHAT_STARTER_CONVERSATIONS}
        onSelect={vi.fn()}
      />
    );
    expect(
      screen.getByTestId('chat-starter-conversation-rail')
    ).toHaveAttribute('data-chat-grid-anchor', 'starter');
  });
});
