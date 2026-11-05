import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fastRender } from '@/tests/utils/fast-render';
import { AssistantMessageText } from './AssistantMessageText';

vi.mock('./ChatMarkdown', () => ({
  ChatMarkdown: ({
    content,
    inline = false,
  }: {
    readonly content: string;
    readonly inline?: boolean;
  }) =>
    inline ? (
      <span data-testid='chat-markdown'>{content}</span>
    ) : (
      <div data-testid='chat-markdown'>{content}</div>
    ),
}));

describe('AssistantMessageText', () => {
  it('shows the text immediately and hands it to the lazy ChatMarkdown chunk', async () => {
    fastRender(
      <AssistantMessageText content='Here is a plain assistant reply.' />
    );

    // Before the markdown chunk resolves the words are already on screen.
    expect(screen.getByText('Here is a plain assistant reply.')).toBeTruthy();
    expect(await screen.findByTestId('chat-markdown')).toHaveTextContent(
      'Here is a plain assistant reply.'
    );
    expect(screen.queryByTestId('entity-mention-span')).toBeNull();
  });

  it('renders entity wire tokens as subdued mention spans with hover cards', async () => {
    const user = userEvent.setup();
    fastRender(
      <AssistantMessageText content='Listen to @release:rel_1[Sober] tonight.' />
    );

    const span = screen.getByTestId('entity-chip-popover-trigger');
    // JOV-9672: the unresolved mention falls back to the entity kind's
    // generic name instead of announcing an unavailable reference.
    expect(span).toHaveTextContent('Release');
    expect(span).toHaveClass('system-b-entity-chip-trigger');
    const markdownSegments = screen.getAllByTestId('chat-markdown');
    expect(markdownSegments[0]).toHaveTextContent('Listen to');
    expect(markdownSegments[1]).toHaveTextContent('tonight.');
    expect(markdownSegments).toHaveLength(2);
    expect(markdownSegments.every(segment => segment.tagName === 'SPAN')).toBe(
      true
    );
    expect(screen.queryByText('@release:rel_1[Sober]')).toBeNull();

    await user.click(screen.getByTestId('entity-chip-popover-trigger'));
    const content = await screen.findByTestId('entity-chip-popover-content');
    expect(content).toHaveAttribute('data-entity-kind', 'release');
    expect(content.textContent).toContain('Release');
  });

  it('keeps structured markdown on the normal block renderer', () => {
    fastRender(
      <AssistantMessageText
        content={'- @release:rel_1[Sober]\n  keeps list semantics'}
      />
    );

    expect(
      screen
        .getAllByTestId('chat-markdown')
        .every(segment => segment.tagName === 'DIV')
    ).toBe(true);
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
