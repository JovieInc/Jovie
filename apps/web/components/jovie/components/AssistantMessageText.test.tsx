import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import { AssistantMessageText } from './AssistantMessageText';

vi.mock('./ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { content: string }) => (
    <div data-testid='chat-markdown'>{content}</div>
  ),
}));

describe('AssistantMessageText', () => {
  it('delegates plain assistant copy to ChatMarkdown', () => {
    fastRender(
      <AssistantMessageText content='Here is a plain assistant reply.' />
    );

    expect(screen.getByTestId('chat-markdown')).toHaveTextContent(
      'Here is a plain assistant reply.'
    );
    expect(screen.queryByTestId('entity-mention-span')).toBeNull();
  });

  it('renders entity wire tokens as subdued mention spans with hover cards', async () => {
    const user = userEvent.setup();
    fastRender(
      <AssistantMessageText content='Listen to @release:rel_1[Sober] tonight.' />
    );

    const span = screen.getByTestId('entity-mention-span');
    expect(span).toHaveTextContent('Sober');
    expect(span).toHaveClass('system-b-entity-mention-span');
    const markdownSegments = screen.getAllByTestId('chat-markdown');
    expect(markdownSegments[0]).toHaveTextContent('Listen to');
    expect(markdownSegments[1]).toHaveTextContent('tonight.');
    expect(screen.queryByText('@release:rel_1[Sober]')).toBeNull();

    await user.click(screen.getByTestId('entity-chip-popover-trigger'));
    const content = await screen.findByTestId('entity-chip-popover-content');
    expect(content).toHaveAttribute('data-entity-kind', 'release');
    expect(content.textContent).toContain('Sober');
  });

  it('renders skill tokens as neutral assistant mentions', () => {
    fastRender(
      <AssistantMessageText content='Try /skill:generateAlbumArt next.' />
    );

    expect(screen.getByTestId('assistant-skill-mention')).toHaveTextContent(
      'Generate album art'
    );
    expect(screen.queryByText('/skill:generateAlbumArt')).toBeNull();
  });
});
