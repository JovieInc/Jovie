import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CHAT_STARTER_CONVERSATIONS } from '@/lib/chat/new-chat-entry-contract';
import { ChatStarterConversationCard } from './ChatStarterConversationCard';

describe('ChatStarterConversationCard', () => {
  it('renders both chat roles and launches the visible user prompt', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const sample = CHAT_STARTER_CONVERSATIONS[0];

    render(<ChatStarterConversationCard sample={sample} onSelect={onSelect} />);

    expect(screen.getByTestId('chat-starter-user-bubble')).toHaveTextContent(
      sample.userPrompt
    );
    expect(
      screen.getByTestId('chat-starter-assistant-bubble')
    ).toHaveTextContent(sample.assistantReply);

    await user.click(
      screen.getByRole('button', {
        name: `Start conversation: ${sample.userPrompt}`,
      })
    );
    expect(onSelect).toHaveBeenCalledWith(sample);
  });

  it('preserves native keyboard activation and visible focus treatment', () => {
    render(
      <ChatStarterConversationCard
        sample={CHAT_STARTER_CONVERSATIONS[1]}
        onSelect={vi.fn()}
      />
    );

    expect(
      screen.getByRole('button', {
        name: `Start conversation: ${CHAT_STARTER_CONVERSATIONS[1].userPrompt}`,
      })
    ).toHaveClass('focus-visible:ring-2');
  });
});
