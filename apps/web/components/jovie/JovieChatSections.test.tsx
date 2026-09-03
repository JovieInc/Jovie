import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CHAT_EMPTY_SAMPLE_STORAGE_KEY } from './chat-empty-starters';
import {
  CHAT_EMPTY_TOP_SPACING_OWNER,
  CHAT_EMPTY_VIEWPORT_CLASSNAME,
  ChatEmptyStateComposerRegion,
  ChatLoadingConversationSkeleton,
} from './JovieChatSections';

describe('JovieChatSections', () => {
  beforeEach(() => {
    sessionStorage.removeItem(CHAT_EMPTY_SAMPLE_STORAGE_KEY);
  });

  it('exports the empty-chat viewport owner so nested shells cannot add a second top gap', () => {
    expect(CHAT_EMPTY_TOP_SPACING_OWNER).toBe('chat-empty-viewport');
    expect(CHAT_EMPTY_VIEWPORT_CLASSNAME).toContain('pt-0');
    expect(CHAT_EMPTY_VIEWPORT_CLASSNAME).toContain(
      'px-(--app-shell-header-padding-x)'
    );
  });

  it('renders the conversation loading skeleton without shifting the composer dock', () => {
    render(<ChatLoadingConversationSkeleton />);

    expect(
      screen.getByTestId('chat-loading-conversation-skeleton')
    ).toHaveAttribute('aria-busy', 'true');
  });

  it('re-exports the Just ask empty region as the shared conversation entry', () => {
    render(
      <ChatEmptyStateComposerRegion>
        <button type='button'>Composer</button>
      </ChatEmptyStateComposerRegion>
    );

    expect(screen.getByTestId('chat-empty-state-greeting')).toHaveTextContent(
      'Just ask'
    );
    expect(
      screen.getByRole('button', { name: 'Composer' })
    ).toBeInTheDocument();
  });
});
